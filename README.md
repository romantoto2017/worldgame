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

## Modo Conquista mundial

Estrategia en tiempo real con pausa (`game/conquista.html`). Elegís un país y construís un imperio desde el 1/1/2027.

- **Dificultad**: combina ejército, economía, calidad de vida, aliados y amenazas vecinas (no solo el tamaño del ejército).
- **Economía**: PBI y población reales (Banco Mundial). Presupuesto en militar, infraestructura y calidad de vida; lo que no asignás va al tesoro.
- **Ejército**: fuerzas armadas reales aproximadas de ~100 países; la tecnología depende de la riqueza del país. Las compras salen del fondo militar y las fábricas/cuarteles tienen un tope anual según el PBI y la población (el doble en guerra).
- **Ejércitos en el mapa**: fichas que movés, dividís y mandás a atacar; las invasiones se ven con flechas animadas. La frontera sin ejército es por donde te invaden.
- **Diplomacia**: relaciones 0–100 según fronteras, región, idioma, bloques y rivalidades reales; alianzas, defensa de aliados, paz.
- **Ideologías**: democracia, socialismo, comunismo, autoritarismo, fascismo, monarquía, teocracia y anarquismo.
- **Decisión del año**: una vez por año, un evento aleatorio con dos opciones.
- **Celular**: sin zoom accidental por doble toque y el gesto de "atrás" abre el menú en lugar de salir.

Datos: `tools/build-conquista.js` genera `game/conquista-data.js` a partir de `tools/raw/gdp.csv` y `tools/raw/pop.csv`.
