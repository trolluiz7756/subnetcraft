// Addressing modes shared by the visual splitter and the VLSM planner.
// reservedStart: addresses reserved at the start of each subnet (incl. network),
// reservedEnd: addresses reserved at the end (broadcast).
export const MODES = {
  standard: {
    minPrefix: 32,
    info: 'Estándar: subred mínima /32. Dos direcciones reservadas por subred de tamaño <= /30: red (network + 0) y broadcast (última dirección).',
  },
  aws: {
    minPrefix: 28,
    reservedStart: 4,
    reservedEnd: 1,
    info: 'AWS: subred mínima /28. Cinco direcciones reservadas por subred: red (network + 0), router de la VPC, DNS de la VPC, uso futuro y broadcast (última dirección).',
  },
  azure: {
    minPrefix: 29,
    reservedStart: 4,
    reservedEnd: 1,
    info: 'Azure: subred mínima /29. Cinco direcciones reservadas por subred: red (network + 0), gateway por defecto, dos de mapeo DNS y broadcast (última dirección).',
  },
  oci: {
    minPrefix: 30,
    reservedStart: 2,
    reservedEnd: 1,
    info: 'OCI: subred mínima /30. Tres direcciones reservadas por subred: red (network + 0), gateway por defecto (network + 1) y broadcast (última dirección).',
  },
};
