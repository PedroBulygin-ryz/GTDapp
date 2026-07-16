# GTDapp

Una app web simple para organizar tareas con un flujo GTD: recopilar, procesar, organizar, revisar y hacer.

## Como probarla

1. Entrar al repositorio en GitHub.
2. Hacer clic en **Code** y luego en **Download ZIP**.
3. Descomprimir el archivo.
4. Abrir `index.html` en el navegador.

No hace falta instalar nada.

## Donde se guardan los datos

Por defecto, las tareas se guardan localmente en el navegador de cada persona. Eso significa que:

- Las notas de una persona no se suben a GitHub.
- Cada navegador tiene sus propios datos.
- Si se borra el historial o los datos del sitio, se pueden perder las tareas guardadas.

La app tambien puede conectarse a un archivo local `bubbles-data.json` desde la pestaña **Recopilar**. Con ese archivo conectado, Bubbles puede guardar una copia local fuera del navegador y cargarla de nuevo si hiciera falta.

## Capturas rapidas

La app puede importar tareas desde un archivo `inbox.txt`. Al abrir la app como archivo local, el navegador puede pedir seleccionarlo manualmente.

Los scripts `capturar-bubbles.sh` y `vaciar-inbox-bubbles.sh` son atajos opcionales para macOS. La captura rapida usa `Control + Option + B`; vaciar el archivo usa `Control + Option + Delete`.

## Archivos principales

- `index.html`: app completa lista para abrir en el navegador.
- `app.js`: logica de la app.
- `styles.css`: estilos.
- `inbox.txt`: archivo de capturas rapidas.
