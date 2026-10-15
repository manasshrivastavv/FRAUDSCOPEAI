"""
FRAUDSCOPE AI — Advanced Threat Network & Coordination Detection Service
=========================================================================
Constructs forensic NetworkX graphs linking suspicious advertisements, cases,
and communication vectors.
Normalizes and sanitizes identifiers to prevent false cluster merges,
mitigates giant components from generic platforms, ranks connection strength,
and evaluates cluster purity and coverage against known ground truth campaigns.
"""

from typing import List, Dict, Any, Tuple, Optional, Set
import networkx as nx
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.models.models import Advertisement, Case, ExtractedEntity, case_advertisements
from app.services.entity_extraction import (
    sanitize_phone_number,
    GENERIC_PLATFORM_DOMAINS,
    GENERIC_TELEGRAM_HANDLES,
    DUMMY_UPI_HANDLES
)


def normalize_graph_identifier(entity_type: str, raw_value: str) -> Optional[Tuple[str, str, str]]:
    """
    Normalizes an identifier for graph link analysis.
    Returns (canonical_type, canonical_value, strength_tier) or None if invalid/placeholder.
    strength_tier in ('STRONG', 'MEDIUM', 'WEAK').
    """
    if not raw_value or not raw_value.strip():
        return None

    raw_clean = raw_value.strip()

    if entity_type in ["PHONE", "WHATSAPP"]:
        sanitized = sanitize_phone_number(raw_clean)
        if sanitized:
            return ("PHONE", sanitized, "STRONG")
        # If raw_clean is an explicitly provided contact without placeholder masks
        if "X" not in raw_clean and "x" not in raw_clean:
            import re
            cleaned = re.sub(r'[^\d]', '', raw_clean)
            if cleaned.startswith("91") and len(cleaned) == 12:
                cleaned = cleaned[2:]
            elif cleaned.startswith("0") and len(cleaned) == 11:
                cleaned = cleaned[1:]
            if len(cleaned) == 10 and cleaned[0] in "6789":
                if cleaned not in {"0000000000", "1111111111", "2222222222", "3333333333", "4444444444", "5555555555", "6666666666", "7777777777", "8888888888", "9999999999"}:
                    return ("PHONE", cleaned, "STRONG")
        return None

    elif entity_type in ["UPI", "UPI_ID"]:
        norm = raw_clean.lower()
        if "@" in norm:
            user_part, handle_part = norm.split("@", 1)
            if norm in DUMMY_UPI_HANDLES or len(user_part) < 3:
                return None
            return ("UPI_ID", norm, "STRONG")
        return None

    elif entity_type in ["BANK", "BANK_ACCOUNT"]:
        return ("BANK", raw_clean.title(), "STRONG")

    elif entity_type == "TELEGRAM":
        handle = raw_clean.lstrip("@").lower().strip()
        if handle and handle not in GENERIC_TELEGRAM_HANDLES and len(handle) >= 3:
            return ("TELEGRAM", handle, "STRONG")
        return None

    elif entity_type in ["URL", "URL_DOMAIN"]:
        norm = raw_clean.lower().strip()
        # Filter generic platforms
        for generic in GENERIC_PLATFORM_DOMAINS:
            if norm == generic or norm.startswith(f"{generic}/") or norm.startswith(f"www.{generic}"):
                return None
        if len(norm) >= 4 and "." in norm:
            return ("URL", norm, "MEDIUM")
        return None

    elif entity_type == "EMAIL":
        norm = raw_clean.lower().strip()
        if not norm.endswith("@example.com") and not norm.endswith("@test.com"):
            return ("EMAIL", norm, "STRONG")
        return None

    elif entity_type == "CRYPTO":
        norm = raw_clean.lower().strip()
        if len(norm) >= 20:
            return ("CRYPTO", norm, "STRONG")
        return None

    return None


def build_threat_graph(
    db: Session,
    ad_limit: int = 50,
    similarity_threshold: float = 80.0,
    max_hub_degree: int = 35
) -> Dict[str, Any]:
    """
    Constructs an authentic tripartite threat graph linking actual database
    advertisements, extracted entities (Phones, UPI handles, Telegrams, URLs, Banks),
    and active investigation cases.
    """
    # 1. Identify key threat campaigns:
    # Ads involved in shared entities (syndicates) + high-risk ads + recent ads
    all_entities = db.query(ExtractedEntity).all()
    entity_to_ads: Dict[Tuple[str, str], Set[int]] = {}
    for e in all_entities:
        norm = normalize_graph_identifier(e.entity_type, e.normalized_value or e.entity_value)
        if norm:
            canon_type, canon_val, _ = norm
            key = (canon_type, canon_val)
            if key not in entity_to_ads:
                entity_to_ads[key] = set()
            entity_to_ads[key].add(e.advertisement_id)

    # Coordinated ads sharing at least 1 entity
    syndicate_ad_ids = set()
    for (itype, ival), aid_set in entity_to_ads.items():
        if len(aid_set) >= 2 and len(aid_set) <= max_hub_degree:
            syndicate_ad_ids.update(aid_set)

    # Select representative advertisements
    selected_ad_ids: List[int] = list(syndicate_ad_ids)[:30]

    # Add recent high-risk ads
    high_risk_rows = db.query(Advertisement.id)\
        .filter(Advertisement.analysis.has(risk_level="HIGH"))\
        .order_by(Advertisement.id.desc())\
        .limit(20)\
        .all()
    for r in high_risk_rows:
        if len(selected_ad_ids) >= ad_limit:
            break
        if r[0] not in selected_ad_ids:
            selected_ad_ids.append(r[0])

    # If still below limit, fill with latest ads
    if len(selected_ad_ids) < ad_limit:
        recent_rows = db.query(Advertisement.id).order_by(Advertisement.id.desc()).limit(ad_limit).all()
        for r in recent_rows:
            if len(selected_ad_ids) >= ad_limit:
                break
            if r[0] not in selected_ad_ids:
                selected_ad_ids.append(r[0])

    ads = db.query(Advertisement).filter(Advertisement.id.in_(selected_ad_ids)).all()
    ad_map = {ad.id: ad for ad in ads}
    ad_node_ids = set()

    G = nx.Graph()
    nodes_list: List[Dict[str, Any]] = []
    edges_list: List[Dict[str, Any]] = []
    edge_keys_seen = set()

    TYPE_MAP = {
        "UPI": "entity_upi",
        "UPI_ID": "entity_upi",
        "PHONE": "entity_phone",
        "WHATSAPP": "entity_phone",
        "TELEGRAM": "entity_telegram",
        "URL": "entity_url",
        "URL_DOMAIN": "entity_url",
        "BANK": "entity_bank",
        "BANK_ACCOUNT": "entity_bank",
        "CRYPTO": "entity_crypto",
        "EMAIL": "entity_email"
    }

    # 1. Add Advertisement Nodes
    for ad in ads:
        node_id = f"ad_{ad.id}"
        ad_node_ids.add(node_id)
        risk_lvl = ad.analysis.risk_level if ad.analysis else "LOW"
        risk_scr = ad.analysis.risk_score if ad.analysis else 20.0

        node_data = {
            "id": node_id,
            "label": ad.custom_id or f"AD-{ad.id}",
            "node_type": "ad",
            "risk_level": risk_lvl,
            "risk_score": risk_scr,
            "metadata": {
                "db_id": ad.id,
                "preview": ad.original_text[:90] + ("..." if len(ad.original_text) > 90 else ""),
                "status": ad.review_status,
                "is_demo": ad.is_demo,
                "data_source": ad.data_source,
                "platform": ad.platform or "Unknown",
                "matched_phrases": [e.matched_text for e in ad.evidence_items] if ad.evidence_items else (ad.analysis.suspicious_phrases if hasattr(ad.analysis, 'suspicious_phrases') else []),
                "entities": [{"type": ent.entity_type, "value": ent.normalized_value or ent.entity_value} for ent in ad.entities] if ad.entities else [],
                "url": ad.submitted_url or "",
                "created_at": ad.created_at.strftime("%Y-%m-%d %H:%M") if ad.created_at else ""
            }
        }
        G.add_node(node_id, **node_data)
        nodes_list.append(node_data)

    # 2. Add Real Entity Nodes and link Ads to them
    selected_ad_id_set = set(selected_ad_ids)
    ad_ents = db.query(ExtractedEntity).filter(ExtractedEntity.advertisement_id.in_(selected_ad_ids)).all()
    ent_to_linked_ads: Dict[Tuple[str, str], Set[int]] = {}

    for e in ad_ents:
        norm = normalize_graph_identifier(e.entity_type, e.normalized_value or e.entity_value)
        if norm:
            canon_type, canon_val, _ = norm
            key = (canon_type, canon_val)
            if key not in ent_to_linked_ads:
                ent_to_linked_ads[key] = set()
            ent_to_linked_ads[key].add(e.advertisement_id)

    ent_node_ids = set()
    for (itype, ival), linked_aids in ent_to_linked_ads.items():
        clean_slug = "".join(c if c.isalnum() else "_" for c in ival.strip().lower())[:32]
        ent_nid = f"ent_{itype.lower()}_{clean_slug}"
        ent_node_ids.add(ent_nid)

        # Entity risk level inherited from connected ads
        linked_objs = [ad_map[aid] for aid in linked_aids if aid in ad_map]
        max_risk = max((a.analysis.risk_score for a in linked_objs if a.analysis and a.analysis.risk_score), default=50.0)
        ent_risk_lvl = "HIGH" if max_risk >= 65 else ("MEDIUM" if max_risk >= 40 else "LOW")

        # Clean display label
        label = ival
        if itype == "TELEGRAM" and not label.startswith("@"):
            label = f"@{label}"
        elif itype == "PHONE" and not label.startswith("+"):
            label = f"+91 {label}"

        node_type = TYPE_MAP.get(itype, "entity_url")
        ent_data = {
            "id": ent_nid,
            "label": label,
            "node_type": node_type,
            "risk_level": ent_risk_lvl,
            "risk_score": round(max_risk, 1),
            "metadata": {
                "entity_type": itype,
                "canonical_value": ival,
                "linked_ads_count": len(linked_aids),
                "linked_ad_ids": list(linked_aids)
            }
        }
        G.add_node(ent_nid, **ent_data)
        nodes_list.append(ent_data)

        # Edges from Ad to Entity
        for aid in linked_aids:
            ad_nid = f"ad_{aid}"
            if ad_nid in ad_node_ids:
                edge_id = f"edge_{ad_nid}_{ent_nid}"
                if edge_id not in edge_keys_seen:
                    edge_keys_seen.add(edge_id)
                    G.add_edge(ad_nid, ent_nid, relationship=f"USES_{itype}")
                    edges_list.append({
                        "id": edge_id,
                        "source": ad_nid,
                        "target": ent_nid,
                        "relationship": f"USES_{itype}",
                        "label": f"Uses {itype}: {label}",
                        "evidence_strength": "HIGH",
                        "coordination_status": "EXTRACTED_ENTITY",
                        "shared_identifiers": [{"type": itype, "value": ival}]
                    })

    # 3. Add Pairwise Coordination Edges between Ads sharing entities
    for (itype, ival), aid_set in ent_to_linked_ads.items():
        filtered_aids = sorted(list(aid_set.intersection(selected_ad_id_set)))
        if len(filtered_aids) >= 2:
            for i in range(len(filtered_aids)):
                for j in range(i + 1, len(filtered_aids)):
                    u = f"ad_{filtered_aids[i]}"
                    v = f"ad_{filtered_aids[j]}"
                    edge_id = f"edge_coord_{filtered_aids[i]}_{filtered_aids[j]}"
                    if edge_id not in edge_keys_seen:
                        edge_keys_seen.add(edge_id)
                        G.add_edge(u, v, relationship="CONFIRMED_COORDINATION")
                        edges_list.append({
                            "id": edge_id,
                            "source": u,
                            "target": v,
                            "relationship": "CONFIRMED_COORDINATION",
                            "label": f"Shared {itype}: {ival}",
                            "evidence_strength": "HIGH",
                            "coordination_status": "CONFIRMED_COORDINATION",
                            "shared_identifiers": [{"type": itype, "value": ival}]
                        })

    # 4. Add Linked Cases (only cases with active relationship to included ads)
    linked_cases = db.query(Case)\
        .join(case_advertisements, case_advertisements.c.case_id == Case.id)\
        .filter(case_advertisements.c.advertisement_id.in_(selected_ad_ids))\
        .distinct()\
        .all()

    for c in linked_cases:
        c_node = f"case_{c.id}"
        case_data = {
            "id": c_node,
            "label": c.case_ref or f"Case #{c.id}",
            "node_type": "case",
            "risk_level": c.priority or "HIGH",
            "risk_score": 85.0 if c.priority == "HIGH" else (50.0 if c.priority == "MEDIUM" else 20.0),
            "metadata": {
                "db_id": c.id,
                "title": c.title,
                "status": c.status,
                "assigned_to": c.assigned_to
            }
        }
        G.add_node(c_node, **case_data)
        nodes_list.append(case_data)

        # Linked ads to this case
        c_ad_links = db.query(case_advertisements.c.advertisement_id)\
            .filter(case_advertisements.c.case_id == c.id, case_advertisements.c.advertisement_id.in_(selected_ad_ids))\
            .all()

        for la in c_ad_links:
            la_node = f"ad_{la[0]}"
            if la_node in ad_node_ids:
                edge_id = f"edge_{c_node}_{la_node}"
                if edge_id not in edge_keys_seen:
                    edge_keys_seen.add(edge_id)
                    G.add_edge(c_node, la_node, relationship="LINKED_CASE")
                    edges_list.append({
                        "id": edge_id,
                        "source": c_node,
                        "target": la_node,
                        "relationship": "LINKED_CASE",
                        "label": "Investigating Case",
                        "evidence_strength": "HIGH",
                        "coordination_status": "OFFICIAL_CASE_LINK",
                        "shared_identifiers": []
                    })

    # 5. Near-Duplicate Campaign Text Links (Weak / Potential Coordination)
    for i in range(len(ads)):
        for j in range(i + 1, len(ads)):
            ad1 = ads[i]
            ad2 = ads[j]
            ratio = fuzz.token_sort_ratio(ad1.normalized_text, ad2.normalized_text)
            if ratio >= similarity_threshold:
                u = f"ad_{ad1.id}"
                v = f"ad_{ad2.id}"
                edge_id = f"edge_sim_{ad1.id}_{ad2.id}"
                if edge_id not in edge_keys_seen:
                    edge_keys_seen.add(edge_id)
                    G.add_edge(u, v, relationship="TEXT_SIMILARITY", similarity=ratio)
                    edges_list.append({
                        "id": edge_id,
                        "source": u,
                        "target": v,
                        "relationship": "TEXT_SIMILARITY",
                        "label": f"{round(ratio)}% Campaign Template Similarity",
                        "evidence_strength": "LOW",
                        "coordination_status": "POTENTIALLY_CONNECTED",
                        "shared_identifiers": [{"type": "TEXT_TEMPLATE", "value": f"{round(ratio)}% text match"}]
                    })

    # 6. Community / Connected Components Detection
    ad_subgraph = G.subgraph(ad_node_ids)
    components = list(nx.connected_components(ad_subgraph))
    clusters_summary = []
    for idx, comp in enumerate(components):
        if len(comp) >= 2:
            comp_nodes = list(comp)
            cluster_ads = [ad_map[int(nid.split("_")[1])] for nid in comp_nodes if nid.startswith("ad_") and int(nid.split("_")[1]) in ad_map]
            if cluster_ads:
                avg_risk = sum((a.analysis.risk_score if a.analysis else 0.0) for a in cluster_ads) / len(cluster_ads)
                clusters_summary.append({
                    "cluster_index": idx + 1,
                    "size": len(cluster_ads),
                    "ad_ids": [a.id for a in cluster_ads],
                    "average_risk_score": round(avg_risk, 1),
                    "high_risk_count": sum(1 for a in cluster_ads if (a.analysis and a.analysis.risk_level == "HIGH"))
                })

    clusters_summary.sort(key=lambda x: x["size"], reverse=True)

    return {
        "nodes": nodes_list,
        "edges": edges_list,
        "total_nodes": len(nodes_list),
        "total_edges": len(edges_list),
        "active_clusters_count": len(clusters_summary),
        "clusters_summary": clusters_summary
    }


def evaluate_cluster_detection(dataset_path: str) -> Dict[str, Any]:
    """
    Evaluates the coordination graph clustering logic against ground truth labels
    (cluster_id C01 through C14 in the uploaded benchmark dataset).
    Calculates cluster coverage, purity, false merges, and missed connections.
    """
    import pandas as pd

    df = pd.read_csv(dataset_path, sep="\t") if "\t" in open(dataset_path, "r", encoding="utf-8").read(500) else pd.read_csv(dataset_path)
    clustered_df = df[df["cluster_id"].notna()].copy()

    if clustered_df.empty:
        return {
            "error": "No ground truth cluster_id annotations found in dataset.",
            "coverage": 0.0,
            "purity": 0.0
        }

    G = nx.Graph()
    ad_identifiers: Dict[str, List[Tuple[str, str]]] = {}

    for _, row in clustered_df.iterrows():
        pid = str(row["post_id"])
        G.add_node(pid, ground_truth=str(row["cluster_id"]))
        id_list = []

        # Phone
        if pd.notna(row.get("phone")):
            norm_p = normalize_graph_identifier("PHONE", str(row["phone"]))
            if norm_p:
                id_list.append((norm_p[0], norm_p[1]))

        # UPI
        if pd.notna(row.get("upi_id")):
            norm_u = normalize_graph_identifier("UPI_ID", str(row["upi_id"]))
            if norm_u:
                id_list.append((norm_u[0], norm_u[1]))

        # URL
        if pd.notna(row.get("url")):
            norm_url = normalize_graph_identifier("URL", str(row["url"]))
            if norm_url:
                id_list.append((norm_url[0], norm_url[1]))

        ad_identifiers[pid] = id_list

    # Connect nodes sharing strong identifiers
    id_map: Dict[Tuple[str, str], List[str]] = {}
    for pid, ids in ad_identifiers.items():
        for ident in ids:
            if ident not in id_map:
                id_map[ident] = []
            id_map[ident].append(pid)

    for ident, pids in id_map.items():
        if len(pids) >= 2:
            for i in range(len(pids)):
                for j in range(i + 1, len(pids)):
                    G.add_edge(pids[i], pids[j], identifier=ident)

    # Evaluate detected components vs ground truth clusters
    components = list(nx.connected_components(G))
    gt_clusters = clustered_df.groupby("cluster_id")["post_id"].apply(lambda s: set(s.astype(str))).to_dict()

    # 1. False Merges: a detected component contains posts from multiple distinct ground truth clusters
    false_merges = 0
    purities = []

    for comp in components:
        if len(comp) >= 2:
            # Map of ground truth labels in this component
            labels_in_comp = [G.nodes[n]["ground_truth"] for n in comp]
            label_counts = pd.Series(labels_in_comp).value_counts()
            dominant_count = label_counts.iloc[0]
            purity = dominant_count / len(labels_in_comp)
            purities.append(purity)
            if len(label_counts) > 1:
                false_merges += 1

    # 2. Cluster Coverage: ground truth items that were successfully grouped with >= 1 same-cluster peer
    covered_items = 0
    total_items = len(clustered_df)

    for pid in clustered_df["post_id"].astype(str):
        neighbors = set(G.neighbors(pid))
        if neighbors:
            my_gt = G.nodes[pid]["ground_truth"]
            same_cluster_neighbors = [n for n in neighbors if G.nodes[n]["ground_truth"] == my_gt]
            if len(same_cluster_neighbors) > 0:
                covered_items += 1

    avg_purity = sum(purities) / len(purities) if purities else 1.0
    coverage_rate = covered_items / total_items if total_items > 0 else 0.0

    return {
        "total_ground_truth_items": total_items,
        "total_ground_truth_clusters": len(gt_clusters),
        "detected_connected_components": len(components),
        "cluster_coverage_rate": round(coverage_rate, 4),
        "cluster_purity_average": round(avg_purity, 4),
        "false_cluster_merges": false_merges,
        "missed_connections": total_items - covered_items
    }
