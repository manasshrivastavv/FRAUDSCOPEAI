import os
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.schemas import NetworkGraphResponse, NetworkNode, NetworkEdge
from app.services.network_service import build_threat_graph, evaluate_cluster_detection

router = APIRouter(prefix="/network", tags=["Threat Network"])


@router.get("", response_model=NetworkGraphResponse)
def get_threat_network(
    limit: int = Query(default=40, ge=5, le=150, description="Max advertisements to include in network graph"),
    db: Session = Depends(get_db)
):
    """
    Builds an interactive forensic graph connecting advertisements, cases,
    and verified communication vectors.
    Sanitizes identifiers, prevents giant components from generic platforms,
    and ranks connections by evidence strength.
    """
    graph_data = build_threat_graph(db, ad_limit=limit)

    nodes = [NetworkNode(**n) for n in graph_data["nodes"]]
    edges = [NetworkEdge(**e) for e in graph_data["edges"]]

    stats = {
        "total_nodes": graph_data["total_nodes"],
        "total_edges": graph_data["total_edges"],
        "active_clusters_count": graph_data["active_clusters_count"],
        "clusters_summary": graph_data["clusters_summary"][:5],
        "ad_nodes": len([n for n in nodes if n.node_type == "ad"]),
        "case_nodes": len([n for n in nodes if n.node_type == "case"]),
        "entity_nodes": len([n for n in nodes if n.node_type not in ("ad", "case")]),
        "high_risk_nodes": len([n for n in nodes if (n.risk_level or "").upper() == "HIGH"])
    }

    return NetworkGraphResponse(
        nodes=nodes,
        edges=edges,
        stats=stats
    )


@router.get("/evaluation")
def get_cluster_evaluation():
    """
    Evaluates coordination graph cluster detection against known ground truth labels
    (cluster_id C01 through C14 in the benchmark dataset).
    Reports cluster coverage, purity, false merges, and missed connections.
    """
    dataset_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "uploaded_dataset.csv"))
    if not os.path.exists(dataset_path):
        return {"error": "Benchmark dataset not found on disk."}

    return evaluate_cluster_detection(dataset_path)
