// dataSources.js
// Definição das fontes de dados (APIs) e parser dos JSONs

/**
 * Normaliza o JSON da API InstaRain para uma lista padronizada de estações.
 */
function parseInstaRain(json) {
  let stationsRaw = [];

  if (Array.isArray(json)) {
    stationsRaw = json;
  } else if (Array.isArray(json.estacoes)) {
    stationsRaw = json.estacoes;
  } else if (Array.isArray(json.data)) {
    stationsRaw = json.data;
  } else {
    console.warn(
      '[RainMonitor] Formato desconhecido da resposta InstaRain, json:',
      json
    );
    stationsRaw = [];
  }

  const stations = stationsRaw
    .map((st, index) => {
      const lat =
        Number(
          st.Latitude ??
            st.latitude ??
            st.lat ??
            st.latDec ??
            st.lat_decimal ??
            st.Lat
        ) || 0;

      const lon =
        Number(
          st.Longitude ??
            st.longitude ??
            st.lon ??
            st.lonDec ??
            st.lon_decimal ??
            st.Lon
        ) || 0;

      const chuva = Number(
        st.IndicadorChuva ??
          st.indicadorChuva ??
          st.chuva ??
          st.RainFlag ??
          st.Rain ??
          0
      );

      const name =
        String(
          st.Nome ??
            st.nome ??
            st.Name ??
            st.estacao ??
            st.station ??
            `Estação ${index + 1}`
        ) || `Estação ${index + 1}`;

      const id =
        String(st.Id ?? st.ID ?? st.id ?? st.codigo ?? st.code ?? name) ||
        name;

      return {
        id,
        name,
        latitude: lat,
        longitude: lon,
        indicadorChuva: chuva,
        raw: st
      };
    })
    .filter(
      (st) => Number.isFinite(st.latitude) && Number.isFinite(st.longitude)
    );

  return stations;
}

// TOKEN de autenticação da API (header "authorization")
const INSTARAIN_AUTH_TOKEN = '496f642b-9e50-4c0d-8274-e049873ba076';

// Exporta todas as fontes de dados registradas
export const DATA_SOURCES = [
  {
    id: 'instarain-meteorologicas',
    name: 'InstaRain - Estações Meteorológicas',
    endpoint:
      'https://instarain.com.br/InstaRainApi/v1/meteorologicas?Online=True',

    parser: parseInstaRain,
    rules: ['RAIN_NEAR_CEMIG'], // mantemos campo para futura expansão

    auth: {
      type: 'customHeader',
      headers: {
        authorization: INSTARAIN_AUTH_TOKEN
      }
    }
  }
];
