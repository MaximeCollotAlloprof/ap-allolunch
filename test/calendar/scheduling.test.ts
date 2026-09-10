import { describe, expect, it } from 'vitest';
import { findCommonAvailableDay, nextDateForDayOfWeek } from '../../src/calendar/scheduling.js';

describe('findCommonAvailableDay', () => {
  it('retourne le premier jour (lundi -> vendredi) disponible chez tous', () => {
    const day = findCommonAvailableDay([
      ['mardi', 'jeudi'],
      ['lundi', 'mardi', 'vendredi'],
      ['mardi', 'vendredi'],
    ]);
    expect(day).toBe('mardi');
  });

  it("retourne undefined si aucun jour n'est commun a tous", () => {
    const day = findCommonAvailableDay([['lundi'], ['mardi']]);
    expect(day).toBeUndefined();
  });

  it('retourne undefined pour un groupe vide', () => {
    expect(findCommonAvailableDay([])).toBeUndefined();
  });
});

describe('nextDateForDayOfWeek', () => {
  it('retourne la prochaine occurrence du jour dans la semaine courante', () => {
    const monday = new Date('2026-09-14T10:00:00'); // lundi
    const result = nextDateForDayOfWeek('jeudi', monday);
    expect(result.toISOString().slice(0, 10)).toBe('2026-09-17');
  });

  it('retourne la semaine suivante si le jour demande est deja passe ou est aujourd’hui', () => {
    const thursday = new Date('2026-09-17T10:00:00'); // jeudi
    const result = nextDateForDayOfWeek('jeudi', thursday);
    expect(result.toISOString().slice(0, 10)).toBe('2026-09-24');
  });

  it('gere le passage au lundi suivant depuis un vendredi', () => {
    const friday = new Date('2026-09-18T10:00:00'); // vendredi
    const result = nextDateForDayOfWeek('lundi', friday);
    expect(result.toISOString().slice(0, 10)).toBe('2026-09-21');
  });

  it('appele un vendredi avec "vendredi" tombe sur le vendredi de la semaine suivante (pas le meme jour)', () => {
    // Cas du cycle hebdomadaire: le matching tourne vendredi 9h pour la semaine
    // demandee le lundi precedent - si le jour commun est justement "vendredi", il ne
    // doit jamais tomber sur le vendredi en cours (deja passe/inutile), mais sur celui
    // de la semaine visee (7 jours plus tard).
    const friday = new Date('2026-09-18T09:00:00'); // vendredi, meme jour que le matching
    const result = nextDateForDayOfWeek('vendredi', friday);
    expect(result.toISOString().slice(0, 10)).toBe('2026-09-25');
  });
});
