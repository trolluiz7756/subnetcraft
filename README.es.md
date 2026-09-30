<p align="center"><img src="assets/logo.png" alt="Logo de SubnetCraft" width="200" /></p>

# SubnetCraft — Planifica, divide y documenta redes IP

[English](README.md) · **Español**

Una suite en el navegador para planear y calcular redes IP. Sirve tanto a quien empieza (flujos guiados, explicaciones en lenguaje simple) como a quien ya tiene experiencia (entradas rápidas, exportaciones, atajos de teclado, configuración para equipos).

Todo se ejecuta en tu navegador. No hay servidor, ni paso de compilación, ni dependencias que instalar.

## Herramientas

| # | Pestaña | Qué hace |
|---|---------|----------|
| 01 | **Divisor visual** | Divide una red en subredes con clics, como una tabla de árbol interactiva. |
| 02 | **Planificador VLSM** | Le dices cuántos equipos necesita cada red y calcula y acomoda cada subred. |
| 03 | **Calculadora IPv4** | Red, broadcast, máscaras, rango de equipos, vista binaria y un resumen en lenguaje simple. |
| 04 | **Calculadora IPv6** | Un plan guiado para quien empieza, más una calculadora completa y un listador de subredes. |
| 05 | **Herramientas** | ¿Esta IP está en la red?, conversor de máscaras, resumen de rutas y detección de traslapes. |

### Divisor visual
- Haz clic en una celda de color para dividir una subred en dos; haz clic en una celda padre para volver a unirla.
- Modos: **Estándar**, **AWS**, **Azure** y **OCI**, cada uno con su tamaño mínimo de subred y sus direcciones reservadas.
- VLAN y nota por subred, con gateway y rango DHCP sugeridos.
- Guarda **proyectos** con nombre (además, tu trabajo se autoguarda como borrador y se restaura al recargar).
- Exportar: **copiar la imagen al portapapeles** (para pegarla en documentos), **PNG** (hasta 4x de resolución), **SVG** (vectorial, sin pérdida de calidad aunque haya muchas subredes), copiar la tabla o **CSV**.
- Envía todas las subredes a la lista guardada de la calculadora IPv4, o **comparte un enlace** que restaura tu trabajo.
- Haz clic en la subred (CIDR) de una fila para copiar toda la fila como una línea separada por tabulaciones.

### Planificador VLSM
- Escribe nombre, VLAN y cantidad de equipos de cada red, elige un margen de crecimiento (0 a 100 %) y obtén la subred exacta de cada una, acomodadas sin huecos.
- **Importa un CSV** (nombre, VLAN, equipos) en vez de escribir fila por fila.
- Una sugerencia en vivo te dice si tu prefijo base es muy pequeño, justo, o mucho más grande de lo necesario.
- Barra de uso con leyenda, bloques de espacio libre y una tabla con máscara, capacidad, gateway, DHCP y rango utilizable.
- Genera **configuración para equipos** de Cisco IOS, MikroTik RouterOS, FortiGate y Linux (iproute2 + dnsmasq) en modo Estándar.
- **Reporte / Imprimir**: un resumen imprimible de una página (red base, uso, tabla de subredes) — usa el diálogo de impresión del navegador para guardarlo como PDF.
- Duplica una fila con un clic para agregar rápido otra red con ajustes casi idénticos.

### Calculadora IPv4
- Acepta `192.168.1.10/24`, `192.168.1.10 255.255.255.0`, un prefijo `/24`, una máscara con puntos o un wildcard.
- Explica el resultado en lenguaje simple y muestra cómo se reparten los 32 bits entre red y equipos.
- Guarda subredes con VLAN y sugerencia de gateway, vuelve a abrirlas o envíalas al divisor.
- Recuerda tus últimas direcciones como sugerencias de autocompletado en el campo.

### IPv6
- **Plan guiado**: genera una ULA privada `/48` (o usa tu propio prefijo), asigna una subred por VLAN y exporta el resultado. Las filas se pueden duplicar o importar desde un CSV (nombre, VLAN).
- **Calculadora**: formas comprimida y expandida, red, primera y última dirección, totales, tipo de dirección y un listador de subredes. No necesitas saber IPv6: incluye ejemplos y un glosario breve. Recuerda tus últimas direcciones como sugerencias de autocompletado.

### Herramientas
- ¿Esta IP está dentro de esta red?
- Conversor de máscara / wildcard / CIDR.
- Resumen de rutas (agregación), incluido el supernet único que las cubre.
- **Comparar dos subredes**: si se traslapan, cuál contiene a cuál, su tamaño relativo, y si son adyacentes al grado de poder resumirse en una sola ruta.
- Detección de traslapes, con opción de cargar las subredes guardadas de la calculadora.

## Comodidades del día a día
- Español e inglés, cambiable en cualquier momento desde el encabezado (recuerda tu elección).
- Temas claro y oscuro.
- Menú de **Ayuda** con atajos según lo que necesites hacer, y globitos `?` junto a los términos técnicos.
- Clic en cualquier valor de un resultado para copiarlo.
- `Alt+1` … `Alt+5` cambian de pestaña.
- Enlaces compartibles para el divisor y la calculadora.
- Deshacer/rehacer en el divisor (`Ctrl+Z` / `Ctrl+Y`, o los botones junto a "Reiniciar").
- Se puede instalar como app (funciona sin conexión) en computadora y celular, con un aviso en pantalla cuando hay una versión nueva lista (solo dale a "Actualizar").
- Un enlace a GitHub en el encabezado con el código fuente.

## Ejecutarla en local

La app usa módulos ES, así que debe servirse por HTTP (abrir `index.html` directamente con `file://` no funciona).

```bash
cd ruta/a/la/carpeta/del/proyecto
python -m http.server 8000
```

Luego abre <http://localhost:8000>. Sirve cualquier servidor estático, por ejemplo la extensión *Live Server* de VS Code.

## Correr las pruebas

La matemática IPv4/IPv6 (`js/ip-utils.js`, `js/ipv6-utils.js`) tiene una suite de pruebas usando el test runner nativo de Node — sin dependencias que instalar, solo Node 18+:

```bash
node --test
```

`package.json` existe solo para esto (`npm test` también funciona); no hace falta para correr la app en sí.

## Privacidad

No se envía nada a ningún lado. Tus datos se quedan en tu navegador (`localStorage`): subredes guardadas, proyectos, el borrador del divisor, el tema y pequeñas preferencias de la interfaz. Los enlaces compartidos llevan el estado dentro del fragmento de la URL (`#…`), que los navegadores no envían a los servidores.

Las fuentes (Space Grotesk y JetBrains Mono) están alojadas dentro del proyecto en `assets/fonts/` — no hay peticiones a servicios externos, y funcionan sin conexión.

## Estructura del proyecto

| Archivo | Para qué sirve |
|---------|----------------|
| `index.html` | Estructura de la página y pestañas |
| `style.css` | Estilos, temas y diseño |
| `manifest.json` | Metadatos de la PWA (nombre, iconos, colores) |
| `sw.js` | Service worker: caché sin conexión para la app instalada (se queda en la raíz — su alcance cubre todo el sitio) |
| `js/main.js` | Pestañas, tema, menú de Ayuda, copiar con clic, atajos |
| `js/ip-utils.js` | Matemática IPv4 e interpretación de la entrada |
| `js/ipv6-utils.js` | Matemática IPv6 (BigInt) |
| `js/modes.js` | Reglas de direccionamiento Estándar / AWS / Azure / OCI |
| `js/calculator.js` | Calculadora IPv4 y subredes guardadas |
| `js/ipv6.js` | Plan guiado y calculadora IPv6 |
| `js/planner.js` | Planificador VLSM y configuración para equipos |
| `js/subnet-splitter.js` | Divisor visual, proyectos, exportaciones y enlaces compartidos |
| `js/splitter-image.js` | Generación de PNG de alta resolución y SVG |
| `js/tools.js` | Herramientas de utilidad |
| `js/i18n.js` | Búsqueda de traducciones y estado del idioma |
| `js/lang-en.js` | Diccionario de traducción al inglés |
| `js/bitbar.js` | Visualización de bits usada por las calculadoras |
| `package.json` | Solo declara el script de pruebas (`node --test`); no hace falta para correr la app |
| `test/` | Pruebas unitarias de la matemática IPv4/IPv6 |

`index.html` carga scripts y estilos con un parámetro de versión (`?v=N`). Sube `N` después de modificar archivos para que los navegadores no sirvan copias en caché. Sube también `SW_VERSION` en `sw.js` al mismo tiempo: controla la caché sin conexión y obliga a las copias instaladas a bajar la actualización.

## Notas y limitaciones
- Los modos de nube siguen las reglas de direcciones reservadas de AWS, Azure y OCI. La configuración para equipos solo se genera en modo Estándar, porque en las nubes el gateway y el DHCP los gestiona la plataforma.
- La configuración generada es un punto de partida. **Revísala antes de aplicarla en equipos reales.**
- Copiar una imagen al portapapeles requiere un contexto seguro (`localhost` o HTTPS) y un navegador compatible; si no, usa la descarga de PNG.
- Requiere un navegador moderno (usa módulos ES, `BigInt`, `color-mix()` y `:has()`).
- Las herramientas de utilidad son solo IPv4.

## Ideas a futuro
- Plan combinado IPv4 + IPv6 (dual-stack).
- Exportación a Terraform para las nubes.
- Auditoría de accesibilidad (contraste, orden de tabulación, soporte para lectores de pantalla).

## Licencia

[MIT](LICENSE) — consulta el archivo LICENSE para el texto completo.
