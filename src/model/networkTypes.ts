export type Kind =
  | 'internet'
  | 'gateway'
  | 'router'
  | 'firewall'
  | 'switch'
  | 'switch-l3'
  | 'switch-unmanaged'
  | 'server'
  | 'workstation'
  | 'accesspoint'
  | 'vm'
  | 'printer'
  | 'dns'
  | 'camera'
  | 'mobile-phone';

export type Protocol = 'ICMP' | 'TCP' | 'UDP';

export type Rule = {
  id: string;
  action: 'allow' | 'deny';
  protocol: Protocol | 'ANY';
  port: string;
  source: string;
  destination: string;
  ingress?: 'any' | 'wan' | 'lan';
};

export type Device = {
  id: string;
  kind: Kind;
  name: string;
  ip: string;
  ipMode: 'auto' | 'static';
  vlan: number;
  x: number;
  y: number;
  online: boolean;
  rules: Rule[];
  defaultAcl?: 'allow' | 'deny';
  routingMode?: 'automatic' | 'static';
  routes?: StaticRoute[];
  wanIp?: string;
  portForwards?: PortForward[];
  staticNat?: StaticNat[];
  allowedVlans?: number[];
  serverRole?: 'server' | 'hypervisor';
  hypervisorVendor?: 'VMware ESXi' | 'Proxmox VE' | 'Hyper-V' | 'KVM';
  hostId?: string;
  ssid?: string;
  /** One bridged SSID; omitted in older projects to use the management VLAN. */
  wifiVlan?: number;
  edgeRole?: 'edge' | 'internal';
  outboundNat?: boolean;
  lease?: DhcpLease;
  services?: Service[];
  dnsServerIds?: string[];
  dnsRecords?: DnsRecord[];
};

export type DnsRecord = {
  id: string;
  name: string;
  deviceId?: string;
  address?: string;
};

export type DhcpLease = {
  ip: string;
  vlan: number;
  serverId: string;
  obtainedAt: number;
  expiresAt: number;
  dnsServerIds?: string[];
};

export type Service = {
  id: string;
  name: string;
  protocol: 'TCP' | 'UDP';
  port: number;
  enabled: boolean;
};

export type StaticRoute = {
  id: string;
  destination: string;
  nextHopId: string;
  metric: number;
};

export type PortForward = {
  id: string;
  protocol: 'TCP' | 'UDP';
  externalIp: string;
  externalPort: number;
  internalIp: string;
  internalPort: number;
  enabled: boolean;
};

export type StaticNat = {
  id: string;
  publicIp: string;
  privateIp: string;
  enabled: boolean;
};

export type Link = {
  id: string;
  a: string;
  b: string;
  mode?: 'auto' | 'access' | 'trunk';
  accessVlan?: number;
  allowedVlans?: number[];
};

export type Network = {
  name: string;
  devices: Device[];
  links: Link[];
  vlans: Vlan[];
};

export type Vlan = {
  id: number;
  name: string;
  cidr: string;
  gateway: string;
  color: string;
  gatewayDeviceId?: string;
  dhcpEnabled?: boolean;
  dhcpServerId?: string;
  dhcpStart?: string;
  dhcpEnd?: string;
  leaseMinutes?: number;
  relayDeviceId?: string;
  dnsServerIds?: string[];
};

export type Probe = {
  source: string;
  destination: string;
  protocol: Protocol;
  port: number;
  checkReply?: boolean;
};

export type Result = {
  ok: boolean;
  path: string[];
  reason: string;
  steps: string[];
  packet?: {
    sourceIp: string;
    destinationIp: string;
    port: number;
  };
  verdict?: 'allowed' | 'blocked' | 'closed' | 'unreachable';
  returnPath?: string[];
  dns?: {
    name: string;
    address?: string;
    serverId?: string;
    ok: boolean;
    queryPath: string[];
    querySteps: string[];
  };
};
