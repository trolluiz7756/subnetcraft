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

### Planificador VLSM
- Escribe nombre, VLAN y cantidad de equipos de cada red, elige un margen de crecimiento (0 a 100 %) y obtén la subred exacta de cada una, acomodadas sin huecos.
- Una sugerencia en vivo te dice si tu prefijo base es muy pequeño, justo, o mucho más grande de lo necesario.
- Barra de uso con leyenda, bloques de espacio libre y una tabla con máscara, capacidad, gateway, DHCP y rango utilizable.
- Genera **configuración para equipos** de Cisco IOS, MikroTik RouterOS, FortiGate y Linux (iproute2 + dnsmasq) en modo Estándar.

### Calculadora IPv4
- Acepta `192.168.1.10/24`, `192.168.1.10 255.255.255.0`, un prefijo `/24`, una máscara con puntos o un wildcard.
- Explica el resultado en lenguaje simple y muestra cómo se reparten los 32 bits entre red y equipos.
- Guarda subredes con VLAN y sugerencia de gateway, vuelve a abrirlas o envíalas al divisor.

### IPv6
- **Plan guiado**: genera una ULA privada `/48` (o usa tu propio prefijo), asigna una subred por VLAN y exporta el resultado.
- **Calculadora**: formas comprimida y expandida, red, primera y última dirección, totales, tipo de dirección y un listador de subredes. No necesitas saber IPv6: incluye ejemplos y un glosario breve.

### Herramientas
- ¿Esta IP está dentro de esta red?
- Conversor de máscara / wildcard / CIDR.
- Resumen de rutas (agregación), incluido el supernet único que las cubre.
- Detección de traslapes, con opción de cargar las subredes guardadas de la calculadora.

## Comodidades del día a día
- Español e inglés, cambiable en cualquier momento desde el encabezado (recuerda tu elección).
- Temas claro y oscuro.
- Menú de **Ayuda** con atajos según lo que necesites hacer, y globitos `?` junto a los términos técnicos.
- Clic en cualquier valor de un resultado para copiarlo.
- `Alt+1` … `Alt+5` cambian de pestaña.
- Enlaces compartibles para el divisor y la calculadora.

## Ejecutarla en local

La app usa módulos ES, así que debe servirse por HTTP (abrir `index.html` directamente con `file://` no funciona).

```bash
cd ruta/a/la/carpeta/del/proyecto
python -m http.server 8000
```

Luego abre <http://localhost:8000>. Sirve cualquier servidor estático, por ejemplo la extensión *Live Server* de VS Code.

## Privacidad

No se envía nada a ningún lado. Tus datos se quedan en tu navegador (`localStorage`): subredes guardadas, proyectos, el borrador del divisor, el tema y pequeñas preferencias de la interfaz. Los enlaces compartidos llevan el estado dentro del fragmento de la URL (`#…`), que los navegadores no envían a los servidores.

Las fuentes (Space Grotesk y JetBrains Mono) se cargan desde Google Fonts; sin conexión, la app usa las fuentes del sistema.

## Estructura del proyecto

| Archivo | Para qué sirve |
|---------|----------------|
| `index.html` | Estructura de la página y pestañas |
| `style.css` | Estilos, temas y diseño |
| `main.js` | Pestañas, tema, menú de Ayuda, copiar con clic, atajos |
| `ip-utils.js` | Matemática IPv4 e interpretación de la entrada |
| `ipv6-utils.js` | Matemática IPv6 (BigInt) |
| `modes.js` | Reglas de direccionamiento Estándar / AWS / Azure / OCI |
| `calculator.js` | Calculadora IPv4 y subredes guardadas |
| `ipv6.js` | Plan guiado y calculadora IPv6 |
| `planner.js` | Planificador VLSM y configuración para equipos |
| `subnet-splitter.js` | Divisor visual, proyectos, exportaciones y enlaces compartidos |
| `splitter-image.js` | Generación de PNG de alta resolución y SVG |
| `tools.js` | Herramientas de utilidad |

`index.html` carga scripts y estilos con un parámetro de versión (`?v=N`). Sube `N` después de modificar archivos para que los navegadores no sirvan copias en caché.

## Notas y limitaciones
- Los modos de nube siguen las reglas de direcciones reservadas de AWS, Azure y OCI. La configuración para equipos solo se genera en modo Estándar, porque en las nubes el gateway y el DHCP los gestiona la plataforma.
- La configuración generada es un punto de partida. **Revísala antes de aplicarla en equipos reales.**
- Copiar una imagen al portapapeles requiere un contexto seguro (`localhost` o HTTPS) y un navegador compatible; si no, usa la descarga de PNG.
- Requiere un navegador moderno (usa módulos ES, `BigInt`, `color-mix()` y `:has()`).
- Las herramientas de utilidad son solo IPv4.

## Ideas a futuro
- Plan combinado IPv4 + IPv6 (dual-stack).
- Informe imprimible o PDF y exportación a Terraform para las nubes.
- Deshacer y rehacer en el divisor, e importación desde CSV.
- Publicarla como sitio estático (por ejemplo GitHub Pages) y soporte sin conexión.

## Licencia

[MIT](LICENSE) — consulta el archivo LICENSE para el texto completo.
