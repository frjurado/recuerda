// Recuerda theme - sharp corners, light bright colors, hard offset shadows.
export const colors = {
  bg: "#FAFAFA",
  surface: "#FFFFFF",
  border: "#0F172A",
  borderSubtle: "#CBD5E1",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textInverse: "#FFFFFF",
  primary: "#FFD93D",
  secondary: "#4D96FF",
  again: "#FF6B6B",
  hard: "#FFB84C",
  good: "#28C76F",
  easy: "#4D96FF",
  call: "#4D96FF",
  message: "#28C76F",
  festiveOverlay: "#FFF6CC",
};

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const formatDateEs = (day: number, month: number) =>
  `${day} de ${MONTHS_ES[month - 1].toLowerCase()}`;

export const hardShadow = {
  // RN 0.81 prefers `boxShadow` over the deprecated `shadow*` props.
  boxShadow: "4px 4px 0px 0px #0F172A",
  elevation: 6,
};
