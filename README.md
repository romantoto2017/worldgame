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

Estrategia en tiempo real con pausa, al estilo de los juegos de dominación (`game/conquista.html`). Elegís un país desde el 1/1/2027 y **ganás al controlar la mitad del PBI mundial**.

- **Mapa por puntos**: el mundo es una grilla de ~80.000 puntos de tierra. Las fronteras se mueven punto por punto.
- **Escuadrones**: tus tropas (y las enemigas) son círculos con bandera y cantidad de soldados. Se seleccionan (tocando, con un recuadro con Shift o botón derecho, o TODOS) y se mandan tocando el mapa. En territorio enemigo anexan lo que pisan si no hay oposición; la guarnición local frena el avance. Si se cruzan dos escuadrones enemigos, combaten. Hay avance automático.
- **Presupuesto en % del PBI**: social, investigación, militar (produce soldados solos, con tope de 1,5 % de la población, y mejora su efectividad) y liquidez (ahorro). Gastar más de 22 % del PBI frena el crecimiento.
- **Investigación**: fusiles modernos, logística, fortificaciones, medicina, industria, blindados, aviación, misiles y bomba nuclear.
- **Tesoro**: reclutar al instante, comprar equipamiento (tanques, aviones, etc., con tope de fábricas), diplomacia y reparar regiones dañadas.
- **Coaliciones**: conquistar rápido hace que otros países te declaren la guerra juntos.
- **Capital**: si cae y el país perdió más de la mitad de su territorio, se rinde; si no, el gobierno se muda.
- **Diplomacia, ideologías, decisión del año y dificultad** como antes (dificultad = ejército × economía × calidad de vida, con aliados y amenazas).

Datos: `tools/build-conquista.js` genera `game/conquista-data.js` a partir de `tools/raw/gdp.csv` y `tools/raw/pop.csv`.
