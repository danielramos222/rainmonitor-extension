// rules.js
// Motor de regras do Monitor de Chuva – VERSÃO ESTRITA (apenas Clima com "chuva")

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
 * Decide se uma estação está em condição de CHUVA ATIVA.
 *
 * 🔒 Regra ESTRITA:
 *  👉 Só é considerada chuva se o texto do campo Clima contiver "chuva".
 *  👉 Nada de Ultimas1h, IndicadorChuva, Tempo, etc.
 */
function stationHasRain(station) {
  const raw = station.raw ?? {};

  const climaRaw = raw.Clima ?? raw.clima ?? '';
  const clima =
    typeof climaRaw === 'string' ? climaRaw.toLowerCase() : String(climaRaw);

  const tempo = Number(raw.Tempo ?? raw.tempo ?? NaN);
  const indicador = Number(raw.IndicadorChuva ?? raw.indicadorChuva ?? NaN);

  // LOG de debug para cada estação avaliada
  console.log('[RainMonitor][Rules] Avaliando estação:', {
    id: station.id,
    name: station.name,
    climaRaw,
    clima,
    tempo,
    indicador
  });

  // Regra única: clima contém "chuva"
  const hasChuvaInClima = clima.includes('chuva');

  if (hasChuvaInClima) {
    console.log(
      '[RainMonitor][Rules] -> CHUVA DETECTADA pelo campo Clima:',
      station.name
    );
    return true;
  }

  console.log(
    '[RainMonitor][Rules] -> SEM CHUVA (Clima não contém "chuva"):',
    station.name
  );
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
    // Se NÃO for chuva, ignora
    if (!stationHasRain(station)) continue;

    const distanceKm = haversineDistanceKm(
      target.latitude,
      target.longitude,
      station.latitude,
      station.longitude
    );

    console.log(
      '[RainMonitor][Rules] Distância da estação até Cemig Sede:',
      station.name,
      distanceKm,
      'km (raio atual:',
      radiusKm,
      'km)'
    );

    if (distanceKm <= radiusKm) {
      console.log(
        '[RainMonitor][Rules] -> Estação DENTRO do raio E com chuva, adicionando:',
        station.name
      );
      rainingStations.push({
        station,
        distanceKm,
        target,
        radiusKm
      });
    } else {
      console.log(
        '[RainMonitor][Rules] -> Estação FORA do raio, ignorando:',
        station.name
      );
    }
  }

  console.log(
    `[RainMonitor][Rules] Total de estações com chuva dentro do raio: ${rainingStations.length}`
  );

  return rainingStations;
}
