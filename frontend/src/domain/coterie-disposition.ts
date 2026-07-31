import type { ChronicleRecord, SystemTag } from "./types";

export type CoterieDispositionValue = "ally" | "enemy" | "neutral" | "unknown" | "custom";

export interface CoterieDisposition {
  value: CoterieDispositionValue;
  label: string;
  color: string;
}

export const COTERIE_DISPOSITIONS: Record<Exclude<CoterieDispositionValue, "custom">, CoterieDisposition> = {
  ally: { value: "ally", label: "Союзник", color: "#2f8f5b" },
  enemy: { value: "enemy", label: "Враг", color: "#b23a48" },
  neutral: { value: "neutral", label: "Нейтралитет", color: "#737982" },
  unknown: { value: "unknown", label: "Неизвестно", color: "#f4f4f2" },
};

export class CoterieDispositionPolicy {
  static readonly namespace = "coterie-disposition";

  read(record: ChronicleRecord): CoterieDisposition | undefined {
    const raw = Array.isArray(record.systemTags) ? record.systemTags : [];
    const found = raw.find((item): item is SystemTag => Boolean(
      item && typeof item === "object" && "namespace" in item && item.namespace === CoterieDispositionPolicy.namespace,
    ));
    if (!found) return undefined;
    if (found.value === "custom") {
      return { value: "custom", label: found.label || "Своё значение", color: found.color || "#737982" };
    }
    return COTERIE_DISPOSITIONS[found.value as keyof typeof COTERIE_DISPOSITIONS] ?? COTERIE_DISPOSITIONS.unknown;
  }

  toSystemTags(value: string, label = "", color = ""): SystemTag[] {
    if (value === "custom" && label.trim()) {
      return [{ namespace: CoterieDispositionPolicy.namespace, value: "custom", label: label.trim(), color: color || "#737982" }];
    }
    const standard = COTERIE_DISPOSITIONS[value as keyof typeof COTERIE_DISPOSITIONS] ?? COTERIE_DISPOSITIONS.unknown;
    return [{ namespace: CoterieDispositionPolicy.namespace, ...standard }];
  }
}
