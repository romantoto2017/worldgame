# Empire

Juego de dominación mundial. Modo **Ruleta mundial**: una ruleta invisible elige un país atacante, después un país vecino como defensor, y se enfrentan con dados × poder. El ganador absorbe el territorio y la población del perdedor. Gana el último que queda.

## Jugar

Abrir `index.html` con cualquier servidor estático:

```bash
python3 -m http.server 8000
```

y entrar a http://localhost:8000/

## Reglas

- **Dados**: cada uno tira 3 dados. Total = suma × poder. Empate: resiste el defensor.
- **Poder**: 1 + 0.3 × log10(población en millones), mínimo ×1.0 (Cuba ×1.3, Argentina ×1.5, Brasil ×1.7, EE.UU. ×1.8, China ×1.9) + 0.1 por cada victoria.
- **Racha**: con 3+ victorias se anuncia la racha.
- **Dado extra**: si un país es 20× más chico que el rival, tira un 4.º dado (rojo).
- **Jefe**: el país con más territorio en el mapa.
- **¡Sorpresa!**: cuando gana el de menor población.

## Datos

`game/data.js` se genera con `tools/build-data.js` (Natural Earth 50m vía `world-atlas`, nombres y superficie de `world-countries`, población de `country-json`, banderas SVG de `flag-icons`).
