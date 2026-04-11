import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBTU(btu: number) {
  return btu.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' BTU/h';
}

export function formatKW(btu: number) {
  const kw = btu / 3412.14;
  return kw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kW';
}
