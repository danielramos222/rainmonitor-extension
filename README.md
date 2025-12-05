````markdown
# 🌧️ RainMonitor Extension – Monitor de Chuva (Cemig)

Extensão para Google Chrome (Manifest V3) que monitora, em **background**, as estações meteorológicas da **InstaRain** e avisa quando há **chuva ativa** em um raio configurável em torno da **Cemig Sede**.

- ⏱️ Checagem automática em intervalos regulares (via `chrome.alarms`)
- 🌧️ Detecção de chuva recente (últimos minutos / 1h)
- 📍 Cálculo de distância com fórmula de Haversine
- 🔔 Notificações nativas do Chrome quando o status de chuva muda
- 🧭 Raio configurável de **0 a 1000 km** pelo popup
- 🗺️ Lista das estações com chuva dentro do raio + link para o mapa

---

## 🧱 Arquitetura / Como funciona

### 1. Fonte de dados

Atualmente a extensão consome a API:

```text
https://instarain.com.br/InstaRainApi/v1/meteorologicas?Online=True
````

Configurada em `dataSources.js`, com:

* `endpoint` da API
* `parser` para normalizar o JSON (`parseInstaRain`)
* `auth.headers.authorization` com o token necessário

No futuro, podem ser adicionadas outras fontes (INMET, etc.) apenas criando novos objetos em `DATA_SOURCES`.

---

### 2. Alvo monitorado

O alvo padrão é a **Cemig Sede**:

```text
Latitude:  -19.923
Longitude: -43.949
Raio:      configurável (0 a 1000 km)
```

Esse alvo é definido em `rules.js` como `TARGETS.CEMIG_SEDE`.

---

### 3. Lógica de detecção de chuva

A função central `stationHasRain(station)` (em `rules.js`) decide se uma estação está com **chuva ativa**, usando o JSON bruto da API InstaRain:

Critérios considerados:

* `IndicadorChuva >= 1`, OU
* houve chuva nenhuma das últimas janelas:

  * `Ultimas5m`
  * `Ultimas10m`
  * `Ultimas20m`
  * `Ultimas1h`
* OU `Tempo === 6` (código de tempo com chuva)
* OU o campo de texto `Clima` contém `"chuva"`

> Importante: **não** usamos apenas `ChuvaDia` (chuva acumulada no dia),
> para evitar marcar como “chovendo agora” uma estação que só choveu mais cedo.

---

### 4. Cálculo de distância (Haversine)

Em `utils.js` existe a função:

```js
haversineDistanceKm(lat1, lon1, lat2, lon2)
```

Ela calcula, em **quilômetros**, a distância entre a estação e a Cemig Sede, usando a fórmula de Haversine.

A regra só considera estações:

* com chuva ativa, **e**
* cuja distância <= raio configurado (0 a 1000 km)

---

### 5. Service Worker / Background

O arquivo `background.js` é o **service worker** (Manifest V3), responsável por:

* Criar o alarm (`chrome.alarms`) para rodar a checagem periódica
* Rodar `runAllChecks()` em:

  * instalação da extensão (`onInstalled`)
  * startup do Chrome (`onStartup`)
  * quando o alarm dispara
  * quando o popup solicita checagem manual (`RUN_CHECK_NOW`)
* Fazer `fetch` da API com headers de autenticação
* Aplicar as regras (`evaluateRulesForSource`)
* Montar a lista de estações com chuva dentro do raio
* Detectar **mudanças** no conjunto de estações chovendo:

  * se mudou (entrou ou saiu estação, ou cessou tudo), dispara notificação
* Persistir o estado em `chrome.storage.local` na chave `cemigLastStatus`

Estrutura básica do estado salvo:

```js
{
  isRaining: boolean,
  checkedAt: string (ISO),
  radiusKm: number,
  stationName: string | null,
  distanceKm: number | null,
  rainingStations: [
    {
      id,
      name,
      distanceKm,
      clima,
      chuvaDia,
      tempo,
      sourceId,
      sourceName,
      url
    },
    ...
  ]
}
```

---

### 6. Popup (IU)

O arquivo `popup.html` + `popup.js` mostra:

* ✅ Se **está ou não chovendo** na área monitorada
* 🕒 Data/hora da última checagem
* 📋 Lista de estações com chuva dentro do raio:

  * nome da estação
  * distância (em km)
  * condição de clima (`Clima`)
  * **link clicável** para abrir o mapa da estação (`s.url`)
* 🎯 Campo para configurar o **raio da Cemig Sede** (`cemigRadiusKm`), de 0 a 1000 km
* 🔘 Botão **“Executar checagem agora”** que manda mensagem para o background (`RUN_CHECK_NOW`)

O popup lê diretamente o estado persistido em `chrome.storage.local`, sem depender de mensagens adicionais.

---

## 📂 Estrutura de Pastas

```text
rainmonitor-extension/
  manifest.json
  background.js
  dataSources.js
  rules.js
  utils.js
  popup.html
  popup.js
  icons/
    rain-16.png
    rain-48.png
    rain-128.png
```

---

## 🔧 Instalação (modo desenvolvedor)

1. Clone este repositório:

   ```bash
   git clone https://github.com/danielramos222/rainmonitor-extension.git
   cd rainmonitor-extension
   ```

2. Abra o Chrome e vá em:

   ```text
   chrome://extensions
   ```

3. Ative o **Modo do desenvolvedor** (canto superior direito).

4. Clique em **"Carregar sem compactação"** / **"Load unpacked"**.

5. Selecione a pasta do projeto (`rainmonitor-extension/`).

6. A extensão “Monitor de Chuva - Cemig” deve aparecer na lista de extensões.

---

## 💡 Uso

1. Clique no ícone da extensão na barra do Chrome.
2. No popup, você verá:

   * Status de chuva (🌧️ ou 🌤️)
   * Última checagem + raio utilizado
   * Lista de estações com chuva dentro do raio (se houver)
3. Ajuste o **raio de monitoramento** (0 a 1000 km) e clique em **“Salvar raio”**.
4. Clique em **“Executar checagem agora”** para forçar uma checagem manual.
5. O monitoramento em background vai rodar periodicamente (via alarm) e:

   * Quando o conjunto de estações com chuva dentro do raio mudar,
   * A extensão envia uma **notificação do sistema** resumindo a situação.

---

## 🔐 Permissões

A extensão utiliza:

* `"alarms"` – para agendamento periódico das checagens
* `"notifications"` – para exibir notificações nativas do Chrome
* `"storage"` – para salvar o estado da última checagem e o raio configurado
* `"host_permissions": ["https://instarain.com.br/*"]` – para acessar a API da InstaRain

---

## 🛠 Tecnologias

* **Manifest V3**
* **JavaScript** (ES modules)
* **Chrome APIs**:

  * `chrome.alarms`
  * `chrome.runtime`
  * `chrome.notifications`
  * `chrome.storage`
* **HTML/CSS** para o popup

---

## 🧩 Extensibilidade

O projeto foi pensado para ser fácil de expandir:

* Para adicionar uma nova fonte (ex.: INMET):

  * criar um novo parser em `dataSources.js`
  * adicionar um novo objeto em `DATA_SOURCES`
* Para adicionar novos alvos (outras sedes/pontos geográficos):

  * estender o objeto `TARGETS` em `rules.js`
  * adaptar a lógica das regras e o estado salvo

---

## 🧪 Debug / Desenvolvimento

* Para ver os logs do **background (service worker)**:

  1. Vá em `chrome://extensions`
  2. Localize “Monitor de Chuva - Cemig”
  3. Clique em **"Service worker"** / “background page”
  4. Veja os logs no console (`[RainMonitor] ...`)

* Para ver os logs do **popup**:

  1. Abra o popup
  2. Clique com o botão direito dentro do popup → *Inspecionar*
  3. Veja a aba Console

---

## 📜 Licença

Defina aqui a licença desejada (por exemplo, MIT):

```text
MIT License
...
```

> **Sugestão**: crie um arquivo `LICENSE` na raiz do projeto e atualize esta seção.

---

## 🙋‍♂️ Autor

**Daniel Ramos**
Repositório:
[https://github.com/danielramos222/rainmonitor-extension](https://github.com/danielramos222/rainmonitor-extension)
