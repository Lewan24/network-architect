import type { Vlan } from './networkTypes';

export function routeSubnet(cidr: string) {
  const [ip, prefix, extra] = cidr.split('/');
  if (
    extra !== undefined ||
    !validIp(ip) ||
    !/^\d{1,2}$/.test(prefix || '') ||
    +prefix < 0 ||
    +prefix > 32
  )
    throw Error('Nieprawidłowa trasa CIDR, np. 0.0.0.0/0 lub 10.0.20.0/24.');
  const size = 2 ** (32 - +prefix);
  const start = Math.floor(ipNumber(ip) / size) * size;
  return { start, end: start + size - 1, prefix: +prefix };
}

export function validIp(value: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((n) => Number(n) <= 255);
}

export function ipNumber(ip: string) {
  return ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

export function numberIp(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function subnet(cidr: string) {
  const [address, prefix, extra] = cidr.split('/');
  if (
    extra !== undefined ||
    !validIp(address) ||
    !/^\d{1,2}$/.test(prefix || '') ||
    +prefix < 1 ||
    +prefix > 30
  )
    throw Error('Podaj podsieć CIDR z prefiksem /1–/30, np. 10.0.30.0/24.');
  const size = 2 ** (32 - +prefix);
  const start = Math.floor(ipNumber(address) / size) * size;
  return {
    start,
    end: start + size - 1,
    prefix: +prefix,
    canonical: `${numberIp(start)}/${+prefix}`,
  };
}

export function hostInVlan(ip: string, vlan: Vlan) {
  if (!validIp(ip)) return false;
  const pool = subnet(vlan.cidr);
  const address = ipNumber(ip);
  return address > pool.start && address < pool.end;
}
