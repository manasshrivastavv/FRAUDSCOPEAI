import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Tag,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Layers,
  X,
  CreditCard,
  Phone,
  Globe,
  MessageSquare,
  FileText,
  Briefcase,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Eye,
  Network
} from 'lucide-react';
import { ThreatNetworkData, NetworkNode } from '../../types';

// ============================================================================
// TYPES & PROPS
// ============================================================================

export interface MuleNetwork3DProps {
  data?: ThreatNetworkData | null;
  isLoading?: boolean;
  onNodeSelect?: (node: NetworkNode | null) => void;
  selectedNodeId?: string | null;
  height?: number | string;
  className?: string;
  showHud?: boolean;
  showControls?: boolean;
  showDetailsPanel?: boolean;
  provenanceLabel?: string;
}

interface Node3DData {
  id: string;
  label: string;
  node_type: string;
  risk_level: string;
  risk_score: number;
  metadata?: Record<string, any>;
  position: THREE.Vector3;
  mesh?: THREE.Mesh;
  connectedIds: string[];
}

// Fallback high-fidelity demo dataset if live database has no nodes
const DEMO_3D_NETWORK: ThreatNetworkData = {
  nodes: [
    { id: 'MULE-ACC-8821', label: 'HDFC Mule Account #8821', node_type: 'entity_bank', risk_level: 'HIGH', risk_score: 94, metadata: { bank: 'HDFC Bank', holder: 'Layering Proxy #1', flag: 'Rapid UPI Outflows' } },
    { id: 'MULE-ACC-4109', label: 'ICICI Mule Hub #4109', node_type: 'entity_bank', risk_level: 'HIGH', risk_score: 91, metadata: { bank: 'ICICI Bank', holder: 'Mule Recruiter', flag: 'High velocity credits' } },
    { id: 'UPI-FAST-99', label: 'fastpay99@ybl', node_type: 'entity_upi', risk_level: 'HIGH', risk_score: 88, metadata: { vpa: 'fastpay99@ybl', handle: 'Yes Bank' } },
    { id: 'UPI-SECURE-01', label: 'secure.return@okhdfcbank', node_type: 'entity_upi', risk_level: 'MEDIUM', risk_score: 65, metadata: { vpa: 'secure.return@okhdfcbank' } },
    { id: 'PH-9876543210', label: '+91 98765 43210', node_type: 'entity_phone', risk_level: 'HIGH', risk_score: 89, metadata: { carrier: 'Airtel', region: 'Delhi NCR' } },
    { id: 'PH-9123456789', label: '+91 91234 56789', node_type: 'entity_phone', risk_level: 'LOW', risk_score: 35, metadata: { carrier: 'Jio', region: 'Mumbai' } },
    { id: 'TG-VIP-SIGNALS', label: '@vip_forex_signals_in', node_type: 'entity_telegram', risk_level: 'HIGH', risk_score: 96, metadata: { members: '48.2K', channel_id: 'C-9901' } },
    { id: 'TG-LOAN-BOT', label: '@instant_cash_india_bot', node_type: 'entity_telegram', risk_level: 'HIGH', risk_score: 85, metadata: { bot: true, campaign: 'Micro-Loan Predatory' } },
    { id: 'DOM-CRYPTO-MINE', label: 'https://fast-incomex.in/claim', node_type: 'entity_url', risk_level: 'HIGH', risk_score: 92, metadata: { registrar: 'Namecheap', hosting: 'Cloudflare Proxy' } },
    { id: 'DOM-JOB-OFFER', label: 'https://daily-wages-earn.biz/reg', node_type: 'entity_url', risk_level: 'MEDIUM', risk_score: 58, metadata: { registrar: 'GoDaddy', ssl: 'Let\'s Encrypt' } },
    { id: 'AD-401', label: 'AD-401: Guaranteed 300% Returns', node_type: 'ad', risk_level: 'HIGH', risk_score: 95, metadata: { platform: 'Instagram', reach: '120K' } },
    { id: 'AD-402', label: 'AD-402: Part-time Task Recruiter', node_type: 'ad', risk_level: 'HIGH', risk_score: 88, metadata: { platform: 'Facebook', reach: '45K' } },
    { id: 'AD-403', label: 'AD-403: Zero Collateral Loan App', node_type: 'ad', risk_level: 'MEDIUM', risk_score: 68, metadata: { platform: 'Telegram', reach: '15K' } },
    { id: 'CASE-101', label: 'Case #FS-101 (Syndicate Vajra)', node_type: 'case', risk_level: 'HIGH', risk_score: 93, metadata: { status: 'INVESTIGATING', priority: 'P1' } },
  ],
  edges: [
    { id: 'e1', source: 'MULE-ACC-8821', target: 'UPI-FAST-99', relationship: 'Linked Settlement VPA', label: 'Settlement Account' },
    { id: 'e2', source: 'MULE-ACC-4109', target: 'UPI-FAST-99', relationship: 'Secondary Liquidation', label: 'Fund Sweep' },
    { id: 'e3', source: 'UPI-FAST-99', target: 'PH-9876543210', relationship: 'Registered Phone', label: 'KYC Mobile' },
    { id: 'e4', source: 'PH-9876543210', target: 'TG-VIP-SIGNALS', relationship: 'Channel Admin Contact', label: 'Admin Link' },
    { id: 'e5', source: 'TG-VIP-SIGNALS', target: 'DOM-CRYPTO-MINE', relationship: 'Promoted Phishing URL', label: 'Lure Domain' },
    { id: 'e6', source: 'AD-401', target: 'DOM-CRYPTO-MINE', relationship: 'Destination Landing Page', label: 'Direct Traffic' },
    { id: 'e7', source: 'AD-401', target: 'PH-9876543210', relationship: 'Embedded WhatsApp Contact', label: 'Direct Hotline' },
    { id: 'e8', source: 'AD-402', target: 'TG-LOAN-BOT', relationship: 'Bot Onboarding Hook', label: 'Tele-Bot' },
    { id: 'e9', source: 'TG-LOAN-BOT', target: 'UPI-SECURE-01', relationship: 'Processing Fee Collection', label: 'Deposit VPA' },
    { id: 'e10', source: 'UPI-SECURE-01', target: 'MULE-ACC-4109', relationship: 'Layered Mule Transfer', label: 'Mule Sweep' },
    { id: 'e11', source: 'AD-403', target: 'DOM-JOB-OFFER', relationship: 'APK Download Host', label: 'App Drop' },
    { id: 'e12', source: 'CASE-101', target: 'MULE-ACC-8821', relationship: 'Primary Target Account', label: 'Case Nexus' },
    { id: 'e13', source: 'CASE-101', target: 'TG-VIP-SIGNALS', relationship: 'Syndicate Comm Channel', label: 'Network Core' },
  ],
};

// Node Colors
function getNodeColors(node: { risk_level?: string }): { hex: number; css: string; isHigh: boolean } {
  const isHigh = (node.risk_level || '').toUpperCase() === 'HIGH';
  if (isHigh) {
    return { hex: 0xD94841, css: '#D94841', isHigh: true }; // Red outline / indicator
  }
  return { hex: 0xC49A35, css: '#C49A35', isHigh: false }; // Refined Metallic Gold
}

// Icon by Entity Type
function getNodeIcon(type: string) {
  switch (type) {
    case 'entity_bank':
    case 'mule':
      return <CreditCard className="w-3.5 h-3.5 text-[#C49A35]" />;
    case 'entity_upi':
    case 'upi':
      return <Activity className="w-3.5 h-3.5 text-[#D4AF37]" />;
    case 'entity_phone':
      return <Phone className="w-3.5 h-3.5 text-[#22B8D4]" />;
    case 'entity_telegram':
      return <MessageSquare className="w-3.5 h-3.5 text-[#6366F1]" />;
    case 'entity_url':
      return <Globe className="w-3.5 h-3.5 text-[#A67C00]" />;
    case 'case':
      return <Briefcase className="w-3.5 h-3.5 text-[#C47B16]" />;
    case 'ad':
    default:
      return <FileText className="w-3.5 h-3.5 text-[#D94841]" />;
  }
}

function getNodeTypeLabel(type: string): string {
  switch (type) {
    case 'entity_bank':
    case 'mule':
      return 'Bank / Mule Account';
    case 'entity_upi':
    case 'upi':
      return 'UPI Identifier';
    case 'entity_phone':
      return 'Phone Number';
    case 'entity_telegram':
      return 'Social / Telegram Vector';
    case 'entity_url':
      return 'Website / Domain';
    case 'case':
      return 'Investigation Case';
    case 'ad':
    default:
      return 'Advertisement Post';
  }
}

// WebGL availability check
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export const MuleNetwork3D: React.FC<MuleNetwork3DProps> = ({
  data,
  isLoading = false,
  onNodeSelect,
  selectedNodeId,
  height = 560,
  className = '',
  showHud = true,
  showControls = true,
  showDetailsPanel = true,
  provenanceLabel
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [viewScope, setViewScope] = useState<'SIMPLIFIED' | 'FULL'>('SIMPLIFIED');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');

  // Selected & Hovered nodes
  const [selectedNode, setSelectedNode] = useState<Node3DData | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ node: Node3DData; screenX: number; screenY: number } | null>(null);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const coreGroupRef = useRef<THREE.Group | null>(null);
  const radarBeamRef = useRef<THREE.Mesh | null>(null);
  const nodeMeshesMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgeLinesMapRef = useRef<Map<string, THREE.Line>>(new Map());

  // Orbit camera drag state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraSphericalRef = useRef({ radius: 110, theta: Math.PI / 4, phi: Math.PI / 3 });
  const targetLookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  const isPausedRef = useRef(false);

  // Active dataset
  const isDemo = !data || !data.nodes || data.nodes.length === 0;
  const activeData: ThreatNetworkData = useMemo(() => {
    if (data && data.nodes && data.nodes.length > 0) {
      return data;
    }
    return DEMO_3D_NETWORK;
  }, [data]);

  // Total Counts from actual data
  const totalActualNodes = activeData.nodes.length;
  const totalActualEdges = activeData.edges.length;
  const totalActualHighRisk = activeData.nodes.filter((n) => (n.risk_level || '').toUpperCase() === 'HIGH').length;

  // Filtered dataset (Simplified View shows 12-16 core nodes; Full Network shows all)
  const processedData = useMemo(() => {
    let nodes = activeData.nodes;

    // In Simplified View, select the 18-24 core nodes:
    // Core Entity Hubs (Telegrams, UPIs, Phones, URLs, Banks) + High-Risk Connected Ads + Cases
    if (viewScope === 'SIMPLIFIED' && nodes.length > 20) {
      const entityHubs = nodes.filter(
        (n) => n.node_type !== 'ad' && n.node_type !== 'case'
      );
      const highRiskAds = nodes.filter(
        (n) => n.node_type === 'ad' && (n.risk_level || '').toUpperCase() === 'HIGH'
      );
      const cases = nodes.filter((n) => n.node_type === 'case');
      const otherNodes = nodes.filter(
        (n) => (n.risk_level || '').toUpperCase() !== 'HIGH'
      );

      const combined = Array.from(
        new Set([...entityHubs, ...highRiskAds.slice(0, 10), ...cases.slice(0, 4), ...otherNodes])
      ).slice(0, 24);
      nodes = combined;
    }

    // Apply Entity Type Filter
    if (typeFilter !== 'ALL') {
      nodes = nodes.filter((n) => {
        if (typeFilter === 'BANK') return n.node_type === 'entity_bank' || n.node_type === 'mule';
        if (typeFilter === 'UPI') return n.node_type === 'entity_upi' || n.node_type === 'upi';
        if (typeFilter === 'PHONE') return n.node_type === 'entity_phone';
        if (typeFilter === 'TELEGRAM') return n.node_type === 'entity_telegram';
        if (typeFilter === 'DOMAIN') return n.node_type === 'entity_url';
        if (typeFilter === 'AD') return n.node_type === 'ad';
        return true;
      });
    }

    // Apply Risk Level Filter
    if (riskFilter !== 'ALL') {
      nodes = nodes.filter((n) => (n.risk_level || '').toUpperCase() === riskFilter);
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = activeData.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, edges };
  }, [activeData, viewScope, typeFilter, riskFilter]);

  // Synchronize selection
  useEffect(() => {
    if (selectedNodeId) {
      const found = processedData.nodes.find((n) => n.id === selectedNodeId);
      if (found) {
        setSelectedNode({
          ...found,
          risk_level: found.risk_level || 'MEDIUM',
          risk_score: found.risk_score || 50,
          position: new THREE.Vector3(),
          connectedIds: activeData.edges
            .filter((e) => e.source === found.id || e.target === found.id)
            .map((e) => (e.source === found.id ? e.target : e.source)),
        });
      }
    }
  }, [selectedNodeId, processedData, activeData]);

  // WebGL check
  useEffect(() => {
    setWebglSupported(isWebGLAvailable());
  }, []);

  // Reduced motion check
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsPlaying(false);
      isPausedRef.current = true;
    }
  }, []);

  useEffect(() => {
    isPausedRef.current = !isPlaying;
  }, [isPlaying]);

  // Highlight direct connections for a specific node
  const handleHighlightConnections = (node: Node3DData) => {
    setSelectedNode(node);
    if (onNodeSelect) onNodeSelect(node);

    // Visually emphasize this node & connected edges in the 3D scene
    edgeLinesMapRef.current.forEach((line) => {
      const isConnected = line.userData.source === node.id || line.userData.target === node.id;
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = isConnected ? 0.95 : 0.08;
    });

    nodeMeshesMapRef.current.forEach((mesh, id) => {
      const isTargetOrConnected = id === node.id || node.connectedIds.includes(id);
      mesh.scale.setScalar(isTargetOrConnected ? 1.3 : 0.85);
    });
  };

  // ============================================================================
  // THREE.JS SCENE INITIALIZATION & ANIMATION
  // ============================================================================

  useEffect(() => {
    if (!webglSupported || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const heightPx = typeof height === 'number' ? height : parseInt(String(height)) || 560;

    // 1. SCENE
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xFFFFFF); // Clean pure white canvas
    scene.fog = new THREE.FogExp2(0xFFFDF7, 0.0035);

    // 2. CAMERA
    const camera = new THREE.PerspectiveCamera(42, width / heightPx, 1, 1000);
    cameraRef.current = camera;
    const updateCameraPos = () => {
      const { radius, theta, phi } = cameraSphericalRef.current;
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(targetLookAtRef.current);
    };
    updateCameraPos();

    // 3. RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current = renderer;
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.replaceChildren(renderer.domElement);

    // 4. SOFT WARM LIGHTING
    const ambientLight = new THREE.AmbientLight(0xFFFDF7, 1.6);
    scene.add(ambientLight);

    const primaryLight = new THREE.DirectionalLight(0xD4AF37, 2.0);
    primaryLight.position.set(50, 80, 60);
    scene.add(primaryLight);

    const rimLight = new THREE.DirectionalLight(0xE6D5A5, 1.2);
    rimLight.position.set(-50, -30, -40);
    scene.add(rimLight);

    // 5. SIMPLIFIED CENTRAL 3D THREAT OBJECT
    // Clean faceted crystalline octahedron with clear edges (no dense wireframe mesh)
    const coreGroup = new THREE.Group();
    coreGroupRef.current = coreGroup;
    scene.add(coreGroup);

    const coreGeo = new THREE.OctahedronGeometry(7.5, 0); // Low-poly clean facet
    coreGeo.scale(0.85, 2.2, 0.85); // Stretched vertically
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0xC49A35,
      metalness: 0.85,
      roughness: 0.2,
      transparent: true,
      opacity: 0.6,
      clearcoat: 0.6,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreGroup.add(coreMesh);

    // Clean edges outline
    const edgesGeo = new THREE.EdgesGeometry(coreGeo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xD4AF37,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.85,
    });
    const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);
    coreGroup.add(edgesMesh);

    // 6. SUBTLE ORBITAL RINGS (Reduced clutter: 2 clean orbital curves + 1 outer circle)
    const orbitsGroup = new THREE.Group();
    scene.add(orbitsGroup);

    const makeCleanOrbit = (radiusX: number, radiusZ: number, rotX: number, opacity: number) => {
      const curve = new THREE.EllipseCurve(0, 0, radiusX, radiusZ, 0, 2 * Math.PI, false, 0);
      const points = curve.getPoints(80);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.LineBasicMaterial({
        color: 0xD4AF37,
        transparent: true,
        opacity,
      });
      const line = new THREE.Line(geo, mat);
      line.rotation.x = rotX;
      return line;
    };

    const orbitInner = makeCleanOrbit(34, 30, 0.35, 0.45);
    const orbitMid = makeCleanOrbit(54, 48, -0.25, 0.35);
    const orbitOuter = makeCleanOrbit(76, 76, 0, 0.25); // Outer perimeter radar circle
    orbitsGroup.add(orbitInner, orbitMid, orbitOuter);

    // Single gentle scanning sweep beam
    const radarBeamGeo = new THREE.RingGeometry(0.5, 76, 32, 1, 0, Math.PI / 5);
    radarBeamGeo.rotateX(-Math.PI / 2);
    const radarBeamMat = new THREE.MeshBasicMaterial({
      color: 0xD4AF37,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const radarBeam = new THREE.Mesh(radarBeamGeo, radarBeamMat);
    scene.add(radarBeam);
    radarBeamRef.current = radarBeam;

    // 7. 3D NODES & CONNECTIONS
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);
    const edgesGroup = new THREE.Group();
    scene.add(edgesGroup);

    const nodeMeshesMap = new Map<string, THREE.Mesh>();
    nodeMeshesMapRef.current = nodeMeshesMap;
    const node3DList: Node3DData[] = [];
    const nodePosMap = new Map<string, THREE.Vector3>();

    const nodeCount = processedData.nodes.length;

    // Layout nodes with generous spacing in an organic 3D elliptical arrangement
    processedData.nodes.forEach((node, i) => {
      const angle = (i / Math.max(1, nodeCount)) * Math.PI * 2;
      // Stagger radius to avoid overlap: 42 to 64
      const radius = 42 + (i % 3) * 11;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      // Gentle height variation
      const y = Math.sin(angle * 3) * 9 + ((i % 2 === 0 ? 1 : -1) * 3);
      const position = new THREE.Vector3(x, y, z);
      nodePosMap.set(node.id, position);

      // Distinct visual styles by category (Section 3)
      let geom: THREE.BufferGeometry;
      const { hex, isHigh } = getNodeColors(node);

      switch (node.node_type) {
        case 'entity_bank':
        case 'mule':
          // Bank / Mule account: Gold circular node
          geom = new THREE.SphereGeometry(2.4, 18, 18);
          break;
        case 'entity_upi':
        case 'upi':
          // UPI identifier: Diamond-shaped node
          geom = new THREE.OctahedronGeometry(2.5, 0);
          break;
        case 'entity_url':
          // Website / Domain: Rounded-square node (Box)
          geom = new THREE.BoxGeometry(2.8, 2.8, 2.0);
          break;
        case 'entity_phone':
          // Phone number: Circular node / Cylinder
          geom = new THREE.CylinderGeometry(1.6, 1.6, 2.6, 16);
          break;
        case 'entity_telegram':
          // Social media account: Circular cone / cylinder
          geom = new THREE.ConeGeometry(2.0, 3.2, 12);
          break;
        case 'case':
          // Investigation Case: Hexagonal prism
          geom = new THREE.CylinderGeometry(2.4, 2.4, 2.6, 6);
          break;
        case 'ad':
        default:
          geom = new THREE.SphereGeometry(2.2, 16, 16);
          break;
      }

      const mat = new THREE.MeshStandardMaterial({
        color: hex,
        metalness: 0.75,
        roughness: 0.25,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(position);
      mesh.userData = { nodeId: node.id };
      nodesGroup.add(mesh);
      nodeMeshesMap.set(node.id, mesh);

      // High-Risk: Clean Red Indicator Outline Ring
      if (isHigh) {
        const ringGeo = new THREE.RingGeometry(3.2, 3.8, 24);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xD94841,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        mesh.add(ringMesh);
      }

      node3DList.push({
        ...node,
        risk_level: node.risk_level || 'MEDIUM',
        risk_score: node.risk_score || 50,
        position,
        mesh,
        connectedIds: activeData.edges
          .filter((e) => e.source === node.id || e.target === node.id)
          .map((e) => (e.source === node.id ? e.target : e.source)),
      });
    });

    // 8. SIMPLIFIED CONNECTIONS (Thin, non-tangled lines, with red only for high risk)
    const edgeLinesMap = new Map<string, THREE.Line>();
    edgeLinesMapRef.current = edgeLinesMap;

    processedData.edges.forEach((edge) => {
      const sourcePos = nodePosMap.get(edge.source);
      const targetPos = nodePosMap.get(edge.target);
      if (!sourcePos || !targetPos) return;

      const sourceNode = processedData.nodes.find((n) => n.id === edge.source);
      const targetNode = processedData.nodes.find((n) => n.id === edge.target);
      const isHighRiskConnection =
        (sourceNode?.risk_level || '').toUpperCase() === 'HIGH' &&
        (targetNode?.risk_level || '').toUpperCase() === 'HIGH';

      // Slight curve toward center for elegance
      const midPoint = new THREE.Vector3()
        .addVectors(sourcePos, targetPos)
        .multiplyScalar(0.5)
        .multiplyScalar(0.88);
      const curve = new THREE.QuadraticBezierCurve3(sourcePos, midPoint, targetPos);
      const points = curve.getPoints(20);

      const edgeGeo = new THREE.BufferGeometry().setFromPoints(points);
      const edgeMat = new THREE.LineBasicMaterial({
        color: isHighRiskConnection ? 0xD94841 : 0xD4AF37,
        transparent: true,
        opacity: isHighRiskConnection ? 0.6 : 0.25,
        linewidth: 1,
      });

      const line = new THREE.Line(edgeGeo, edgeMat);
      line.userData = { edgeId: edge.id, source: edge.source, target: edge.target };
      edgesGroup.add(line);
      edgeLinesMap.set(edge.id, line);
    });

    // ========================================================================
    // INTERACTION: DRAG ORBIT, RAYCASTING, HOVER & SELECTION
    // ========================================================================

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getCanvasCoords = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        clientX: e.clientX,
        clientY: e.clientY,
      };
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const coords = getCanvasCoords(e);
      mouse.x = coords.x;
      mouse.y = coords.y;

      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x;
        const deltaY = e.clientY - previousMousePositionRef.current.y;
        cameraSphericalRef.current.theta -= deltaX * 0.007;
        cameraSphericalRef.current.phi = Math.max(
          0.2,
          Math.min(Math.PI - 0.2, cameraSphericalRef.current.phi - deltaY * 0.007)
        );
        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
        updateCameraPos();
        return;
      }

      // Raycast hover
      raycaster.setFromCamera(mouse, camera);
      const nodeMeshes = Array.from(nodeMeshesMap.values());
      const intersects = raycaster.intersectObjects(nodeMeshes, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const hitId = hitMesh.userData.nodeId;
        const foundNode = node3DList.find((n) => n.id === hitId);
        if (foundNode) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredNode({
            node: foundNode,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
          });

          // Highlight direct connections
          edgeLinesMap.forEach((line) => {
            const isConnected = line.userData.source === hitId || line.userData.target === hitId;
            const mat = line.material as THREE.LineBasicMaterial;
            mat.opacity = isConnected ? 0.9 : 0.08;
          });
          return;
        }
      }

      renderer.domElement.style.cursor = 'grab';
      setHoveredNode(null);

      // Restore edge opacity if no node hovered and no selection active
      if (!selectedNode) {
        edgeLinesMap.forEach((line) => {
          const mat = line.material as THREE.LineBasicMaterial;
          mat.opacity = 0.25;
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      isDraggingRef.current = false;

      const deltaX = Math.abs(e.clientX - previousMousePositionRef.current.x);
      const deltaY = Math.abs(e.clientY - previousMousePositionRef.current.y);
      if (deltaX < 5 && deltaY < 5) {
        const coords = getCanvasCoords(e);
        mouse.x = coords.x;
        mouse.y = coords.y;
        raycaster.setFromCamera(mouse, camera);
        const nodeMeshes = Array.from(nodeMeshesMap.values());
        const intersects = raycaster.intersectObjects(nodeMeshes, false);

        if (intersects.length > 0) {
          const hitMesh = intersects[0].object as THREE.Mesh;
          const hitId = hitMesh.userData.nodeId;
          const foundNode = node3DList.find((n) => n.id === hitId);
          if (foundNode) {
            handleHighlightConnections(foundNode);
            return;
          }
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraSphericalRef.current.radius = Math.max(
        45,
        Math.min(200, cameraSphericalRef.current.radius + e.deltaY * 0.08)
      );
      updateCameraPos();
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElement.addEventListener('wheel', handleWheel, { passive: false });

    // Resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const newWidth = mountRef.current.clientWidth || 800;
      const newHeight = typeof height === 'number' ? height : parseInt(String(height)) || 560;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // ========================================================================
    // SLOWED-DOWN, CALM ANIMATION LOOP (Section 2)
    // ========================================================================
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (!isPausedRef.current) {
        // Calm, smooth core rotation (~0.18 rad/sec)
        coreGroup.rotation.y = elapsedTime * 0.18;
        coreGroup.position.y = Math.sin(elapsedTime * 1.0) * 0.8;

        // Gentle scanning sweep
        radarBeam.rotation.y = elapsedTime * 0.45;

        // Subtle orbit tilt
        orbitInner.rotation.y = elapsedTime * 0.04;
        orbitMid.rotation.y = -elapsedTime * 0.03;

        // Very slow ambient camera drift when not dragging
        if (!isDraggingRef.current) {
          cameraSphericalRef.current.theta += 0.001;
          updateCameraPos();
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElement.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
    };
  }, [webglSupported, height, processedData, activeData]);

  // Controls
  const handleResetCamera = useCallback(() => {
    cameraSphericalRef.current = { radius: 110, theta: Math.PI / 4, phi: Math.PI / 3 };
    if (cameraRef.current) {
      const { radius, theta, phi } = cameraSphericalRef.current;
      cameraRef.current.position.x = radius * Math.sin(phi) * Math.sin(theta);
      cameraRef.current.position.y = radius * Math.cos(phi);
      cameraRef.current.position.z = radius * Math.sin(phi) * Math.cos(theta);
      cameraRef.current.lookAt(targetLookAtRef.current);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    cameraSphericalRef.current.radius = Math.max(45, cameraSphericalRef.current.radius - 16);
    if (cameraRef.current) {
      const { radius, theta, phi } = cameraSphericalRef.current;
      cameraRef.current.position.x = radius * Math.sin(phi) * Math.sin(theta);
      cameraRef.current.position.y = radius * Math.cos(phi);
      cameraRef.current.position.z = radius * Math.sin(phi) * Math.cos(theta);
      cameraRef.current.lookAt(targetLookAtRef.current);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    cameraSphericalRef.current.radius = Math.min(200, cameraSphericalRef.current.radius + 16);
    if (cameraRef.current) {
      const { radius, theta, phi } = cameraSphericalRef.current;
      cameraRef.current.position.x = radius * Math.sin(phi) * Math.sin(theta);
      cameraRef.current.position.y = radius * Math.cos(phi);
      cameraRef.current.position.z = radius * Math.sin(phi) * Math.cos(theta);
      cameraRef.current.lookAt(targetLookAtRef.current);
    }
  }, []);

  // Clear node selection & restore full opacity
  const handleClearSelection = () => {
    setSelectedNode(null);
    if (onNodeSelect) onNodeSelect(null);

    edgeLinesMapRef.current.forEach((line) => {
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = 0.25;
    });

    nodeMeshesMapRef.current.forEach((mesh) => {
      mesh.scale.setScalar(1.0);
    });
  };

  // ============================================================================
  // RENDER (CLEAN, MINIMAL WHITE + GOLD INTERFACE)
  // ============================================================================

  return (
    <div
      className={`relative rounded-2xl border border-[#E9E2D1] bg-[#FFFFFF] shadow-sm overflow-hidden select-none ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {/* 1. 3D WEBGL CANVAS */}
      {webglSupported ? (
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      ) : (
        /* Fallback if WebGL unavailable */
        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[#FAF8F2] text-center">
          <AlertTriangle className="w-8 h-8 text-[#C49A35] mb-2" />
          <h3 className="text-sm font-bold text-[#242424]">WebGL Hardware Acceleration Unavailable</h3>
          <p className="text-xs text-[#747474] mt-1">Enable WebGL in your browser to view the interactive 3D threat radar.</p>
        </div>
      )}

      {/* 2. SIMPLE TOP HEADER & 3 KEY METRICS ONLY (Section 6) */}
      {showHud && (
        <div className="absolute top-3.5 left-3.5 right-3.5 flex flex-wrap items-center justify-between gap-3 pointer-events-none z-10">
          {/* Header */}
          <div className="flex items-center gap-2.5 p-2 px-3 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E9E2D1] shadow-xs pointer-events-auto">
            <div className="w-7 h-7 rounded-lg bg-[#FAF8F2] border border-[#E6D5A5] flex items-center justify-center text-[#C49A35]">
              <Network className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#242424] font-mono tracking-wider uppercase flex items-center gap-2">
                <span>MULE NETWORK</span>
                {isDemo && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#FAF8F2] text-[#80621D] font-semibold border border-[#E6D5A5]">
                    DEMO DATA
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[#747474]">3D Threat Investigation</p>
            </div>
          </div>

          {/* 3 Key Metrics Only (Section 6) */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="p-2 px-3.5 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E9E2D1] shadow-xs flex items-center gap-4 text-xs font-mono">
              <div className="text-center">
                <span className="text-[10px] text-[#747474] block">Entities</span>
                <span className="font-bold text-[#242424] text-sm">{totalActualNodes}</span>
              </div>
              <div className="w-px h-5 bg-[#E9E2D1]" />
              <div className="text-center">
                <span className="text-[10px] text-[#747474] block">Connections</span>
                <span className="font-bold text-[#242424] text-sm">{totalActualEdges}</span>
              </div>
              <div className="w-px h-5 bg-[#E9E2D1]" />
              <div className="text-center">
                <span className="text-[10px] text-[#D94841] block font-semibold">High-Risk Entities</span>
                <span className="font-bold text-[#D94841] text-sm">{totalActualHighRisk}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. INTERACTION CONTROLS & SCOPE TOGGLE (Section 5) */}
      {showControls && (
        <div className="absolute top-16 left-3.5 flex flex-wrap items-center gap-2 z-10 pointer-events-auto">
          {/* Simplified View vs Full Network Toggle (Default: Simplified View) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E9E2D1] shadow-xs text-xs font-mono">
            <button
              type="button"
              onClick={() => setViewScope('SIMPLIFIED')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewScope === 'SIMPLIFIED'
                  ? 'bg-[#C49A35] text-white font-bold shadow-xs'
                  : 'text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2]'
              }`}
              title="Show 12-16 core nodes with clean spacing"
            >
              Simplified View
            </button>
            <button
              type="button"
              onClick={() => setViewScope('FULL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewScope === 'FULL'
                  ? 'bg-[#C49A35] text-white font-bold shadow-xs'
                  : 'text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2]'
              }`}
              title="Display entire network graph"
            >
              Full Network
            </button>
          </div>

          {/* Play/Pause & Reset & Zoom */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E9E2D1] shadow-xs">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg text-xs font-mono text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2] transition-colors"
              title={isPlaying ? 'Pause 3D rotation' : 'Resume 3D rotation'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleResetCamera}
              className="p-1.5 rounded-lg text-xs font-mono text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2] transition-colors"
              title="Reset View"
              aria-label="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-[#E9E2D1]" />
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg text-xs font-mono text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2] transition-colors"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg text-xs font-mono text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2] transition-colors"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 4. FILTERS BAR (BOTTOM-RIGHT) */}
      {showControls && (
        <div className="absolute bottom-3.5 right-3.5 hidden sm:flex items-center gap-2 z-10">
          {/* Entity Type Filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E9E2D1] text-xs font-mono shadow-xs">
            <span className="text-[10px] text-[#747474] px-1.5 uppercase font-medium">Type:</span>
            {(['ALL', 'BANK', 'UPI', 'PHONE', 'TELEGRAM', 'DOMAIN'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-all ${
                  typeFilter === t
                    ? 'bg-[#C49A35] text-white font-bold'
                    : 'text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Risk Filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E9E2D1] text-xs font-mono shadow-xs">
            <span className="text-[10px] text-[#747474] px-1.5 uppercase font-medium">Risk:</span>
            {(['ALL', 'HIGH'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRiskFilter(r)}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-all ${
                  riskFilter === r
                    ? r === 'HIGH'
                      ? 'bg-[#D94841] text-white font-bold'
                      : 'bg-[#C49A35] text-white font-bold'
                    : 'text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2]'
                }`}
              >
                {r === 'HIGH' ? 'High Only' : 'All'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. HOVER TOOLTIP */}
      {hoveredNode && !selectedNode && (
        <div
          className="absolute pointer-events-none z-30 transition-all duration-75 ease-out"
          style={{
            left: `${Math.min(hoveredNode.screenX + 12, (mountRef.current?.clientWidth || 600) - 210)}px`,
            top: `${Math.max(hoveredNode.screenY - 38, 12)}px`,
          }}
        >
          <div className="p-2 px-2.5 rounded-xl bg-[#FFFFFF]/95 backdrop-blur-md border border-[#E9E2D1] shadow-md text-xs font-mono max-w-xs space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-[#242424] truncate max-w-[130px]">
                {getNodeIcon(hoveredNode.node.node_type)}
                <span className="truncate">{hoveredNode.node.label}</span>
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  hoveredNode.node.risk_level === 'HIGH'
                    ? 'bg-[#D94841]/15 text-[#D94841]'
                    : 'bg-[#C49A35]/15 text-[#80621D]'
                }`}
              >
                {hoveredNode.node.risk_level}
              </span>
            </div>
            <p className="text-[10px] text-[#747474]">
              {getNodeTypeLabel(hoveredNode.node.node_type)} • {hoveredNode.node.connectedIds.length} Connected
            </p>
          </div>
        </div>
      )}

      {/* 6. HELPFUL SELECTED ENTITY INFORMATION PANEL (Section 7) */}
      {showDetailsPanel && selectedNode && (
        <aside
          role="complementary"
          aria-label="Selected Entity Details"
          className="absolute top-16 right-3.5 bottom-12 w-72 max-w-[calc(100%-2rem)] rounded-xl bg-[#FFFFFF]/95 backdrop-blur-md border border-[#E9E2D1] shadow-lg p-3.5 flex flex-col justify-between z-20 animate-in fade-in slide-in-from-right-3 duration-200"
        >
          <div className="space-y-3 overflow-y-auto pr-1">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#E9E2D1]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#FAF8F2] border border-[#E6D5A5]">
                  {getNodeIcon(selectedNode.node_type)}
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#747474] uppercase block">
                    {getNodeTypeLabel(selectedNode.node_type)}
                  </span>
                  <h4 className="text-xs font-bold text-[#242424] leading-tight truncate max-w-[150px]">
                    {selectedNode.label}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearSelection}
                className="p-1 rounded-lg text-[#747474] hover:text-[#242424] hover:bg-[#FAF8F2] transition-colors"
                aria-label="Close details"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Risk Assessment */}
            <div className="p-2 rounded-lg bg-[#FAF8F2] border border-[#E9E2D1] space-y-1 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#747474]">Risk Level:</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    selectedNode.risk_level === 'HIGH'
                      ? 'bg-[#D94841]/15 text-[#D94841]'
                      : 'bg-[#C49A35]/15 text-[#80621D]'
                  }`}
                >
                  {selectedNode.risk_level} ({Math.round(selectedNode.risk_score)}/100)
                </span>
              </div>
            </div>

            {/* Connected Entities & Relationship Evidence */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-[#747474] font-semibold">
                  Connected Entities ({selectedNode.connectedIds.length})
                </span>
                <button
                  type="button"
                  onClick={() => handleHighlightConnections(selectedNode)}
                  className="text-[10px] font-mono text-[#80621D] hover:underline flex items-center gap-1 font-semibold"
                >
                  <Eye className="w-3 h-3" />
                  <span>Highlight</span>
                </button>
              </div>

              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedNode.connectedIds.length === 0 ? (
                  <p className="text-xs text-[#747474] italic">No direct connections found</p>
                ) : (
                  selectedNode.connectedIds.map((linkId) => {
                    const targetNode = activeData.nodes.find((n) => n.id === linkId);
                    const edgeRel = activeData.edges.find(
                      (e) =>
                        (e.source === selectedNode.id && e.target === linkId) ||
                        (e.target === selectedNode.id && e.source === linkId)
                    );
                    return (
                      <div
                        key={linkId}
                        onClick={() => {
                          if (targetNode) {
                            handleHighlightConnections({
                              ...targetNode,
                              risk_level: targetNode.risk_level || 'MEDIUM',
                              risk_score: targetNode.risk_score || 50,
                              position: new THREE.Vector3(),
                              connectedIds: activeData.edges
                                .filter((e) => e.source === targetNode.id || e.target === targetNode.id)
                                .map((e) => (e.source === targetNode.id ? e.target : e.source)),
                            });
                          }
                        }}
                        className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#E9E2D1] hover:border-[#C49A35] transition-all cursor-pointer flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[130px]">
                          {getNodeIcon(targetNode?.node_type || '')}
                          <span className="text-[#242424] font-medium truncate">
                            {targetNode?.label || linkId}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-[#80621D] truncate max-w-[70px]">
                          {edgeRel?.label || 'Linked'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Evidentiary Metadata */}
            {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
              <div className="p-2 rounded-lg bg-[#FAF8F2] border border-[#E9E2D1] font-mono text-[10px] space-y-0.5">
                <span className="text-[9px] text-[#747474] block uppercase font-semibold">Evidence Details:</span>
                {Object.entries(selectedNode.metadata).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center text-[#242424]">
                    <span className="text-[#747474] capitalize">{k.replace('_', ' ')}:</span>
                    <span className="font-semibold truncate max-w-[120px]">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action button */}
          <div className="pt-2 border-t border-[#E9E2D1]">
            <button
              type="button"
              onClick={handleClearSelection}
              className="w-full py-1 px-2.5 rounded-lg bg-[#FAF8F2] hover:bg-[#E6D5A5]/30 border border-[#E9E2D1] text-[11px] font-semibold text-[#80621D] transition-colors text-center block"
            >
              Reset Selection
            </button>
          </div>
        </aside>
      )}

      {/* 7. COMPACT LEGEND & BOTTOM INTERACTION HINT (Section 6) */}
      <div className="absolute bottom-3 left-3.5 right-3.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
        {/* Bottom Navigation Hint (Section 6) */}
        <div className="p-1 px-2.5 rounded-full bg-[#FFFFFF]/85 backdrop-blur-md border border-[#E9E2D1] text-[10px] font-mono text-[#747474] shadow-xs pointer-events-auto">
          Drag to rotate · Scroll to zoom · Click a node to inspect
        </div>

        {/* Compact Legend (Section 6) */}
        <div className="p-1 px-2.5 rounded-full bg-[#FFFFFF]/85 backdrop-blur-md border border-[#E9E2D1] text-[10px] font-mono text-[#747474] shadow-xs pointer-events-auto flex items-center gap-2">
          <span>Gold = Entity</span>
          <span className="text-[#E9E2D1]">|</span>
          <span>Line = Relationship</span>
          <span className="text-[#E9E2D1]">|</span>
          <span className="text-[#D94841] font-semibold">Red = High Risk</span>
        </div>
      </div>
    </div>
  );
};
