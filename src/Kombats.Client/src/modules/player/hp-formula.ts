// TODO: align with backend — HP formula is server-authoritative,
// this is a client-side approximation until backend exposes maxHp
// on CharacterResponse
export const VITALITY_TO_HP = 6;

export function deriveMaxHp(vitality: number): number {
  return vitality * VITALITY_TO_HP;
}
