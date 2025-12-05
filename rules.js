// rules.js
// Motor de regras do Monitor de Chuva

import { haversineDistanceKm } from './utils.js';

// Alvo principal: Cemig Sede
const TARGETS = {
  CEMIG_SEDE: {
    id: 'CEMIG_SEDE',
    name: 'Cemig Sede',
    latitude: -19.923,
    longitude: -43.949,
    defaultRadiusKm: 20 // raio padrão, se não vier outro
  }
};

/**
 * Decide se uma estação está em condição de chuva ATIVA,
 * combinando vários campos do JSON bruto.
 *
 * Regras:
 *  - IndicadorChuva >= 1
 *  - OU houve chuva nos últimos minutos/1h
 *  - OU código de tempo indica chuva (ex.: Tempo = 6)
 *  - OU Clima contém "chuva"
 */
function stationHasRain(station) {
  const indicador = Number(station.indicadorChuva ?? 0);
  const raw = station.raw ?? {};

  // Chuva recente
  const ult5 = Number(raw.Ultimas5m ?? 0);
  const ult10 = Number(raw.Ultimas10m ?? 0);
  const ult20 = Number(raw.Ultimas20m ?? 0);
  const ult1h = Number(raw.Ultimas1h ?? 0);

  const tempo = Number(raw.Tempo ?? raw.tempo ?? NaN);
  const clima = String(raw.Clima ?? raw.clima ?? '').toLowerCase();

  // 1) Indicador explícito de chuva
  if (Number.isFinite(indicador) && indicador >= 1) {
    return true;
  }

  // 2) Chuva recente (últimos minutos / 1h)
  if (ult5 > 0 || ult10 > 0 || ult20 > 0 || ult1h > 0) {
    return true;
  }

  // 3) Código numérico de tempo indicando chuva
  if (tempo === 6) {
    return true;
  }

  // 4) Texto de clima contendo "chuva"
  if (clima.includes('chuva')) {
    return true;
  }

  return false;
}

/**
 * Avalia estações para o alvo "Cemig Sede" e devolve
 * as que estão chovendo dentro do raio.
 *
 * @param {object} source Fonte (de DATA_SOURCES)
 * @param {Array<any>} stations Estações normalizadas
 * @param {object} options Ex.: { cemigRadiusKm: number }
 * @returns {Array<{ station: any, distanceKm: number, target: any, radiusKm: number }>}
 */
export async function evaluateRulesForSource(source, stations, options = {}) {
  const target = TARGETS.CEMIG_SEDE;
  const radiusKm =
    Number(options.cemigRadiusKm) || target.defaultRadiusKm;

  const rainingStations = [];

  for (const station of stations) {
    if (!stationHasRain(station)) continue;

    const distanceKm = haversineDistanceKm(
      target.latitude,
      target.longitude,
      station.latitude,
      station.longitude
    );

    if (distanceKm <= radiusKm) {
      rainingStations.push({
        station,
        distanceKm,
        target,
        radiusKm
      });
    }
  }

  return rainingStations;
}
