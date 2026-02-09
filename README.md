# AuditorIA - Transcripción en tiempo real con IA

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://github.com/AgustinBouzonn/auditoria-plugin)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?style=flat-square&logo=google-chrome&logoColor=white)](https://github.com/AgustinBouzonn/auditoria-plugin)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white)](https://github.com/AgustinBouzonn/auditoria-plugin)
[![Version](https://img.shields.io/badge/version-2.0-blue?style=flat-square)](https://github.com/AgustinBouzonn/auditoria-plugin)

Extensión de Chrome para transcribir audio dual (micrófono + sistema) en tiempo real y generar recomendaciones para agentes de call center.

**Versión 2.0 - Ahora funciona solo como extensión de Chrome, sin servidor Python.**

## Requisitos Previos

- Google Chrome o Microsoft Edge (versión reciente)
- Clave API de OpenAI

## Instalación

### 1. Instalar la extensión en Chrome

1. Abre Chrome y navega a `chrome://extensions/`
2. Activa el "Modo desarrollador" (Developer mode) en la esquina superior derecha
3. Haz clic en "Cargar descomprimida" (Load unpacked)
4. Selecciona la carpeta del proyecto (`auditorIA-plugin`)

### 2. Configurar la API Key

1. Haz clic en el icono de AuditorIA en la barra de extensiones
2. Ingresa tu clave de OpenAI en el campo "OpenAI API Key"
3. Haz clic en el botón "Save"

## Uso

### Paso 1: Iniciar la grabación

1. Haz clic en el icono de AuditorIA
2. Haz clic en el botón "Start Recording"
3. Aparecerá una ventana de recorder
4. Selecciona la ventana/pantalla que deseas capturar

### Paso 2: Habilitar audio del sistema

**IMPORTANTE:** En el selector de pantalla/ventana, asegúrate de marcar la casilla "Share system audio" (Compartir audio del sistema). Sin esto, no se capturará el audio del cliente.

### Paso 3: Permisos de micrófono

1. Acepta los permisos de micrófono cuando Chrome lo solicite
2. La extensión comenzará a capturar ambos flujos de audio

### Paso 4: Ver resultados

- **Live Transcript:** Verás la transcripción en tiempo real etiquetada como `[Agent]` o `[Customer]`
- **Recommendations:** La IA generará recomendaciones para el agente basadas en la conversación

### Paso 5: Detener la grabación

Haz clic en el botón "Stop" en el popup

## Funcionalidades

- Captura dual de audio: micrófono (Agente) + sistema (Cliente)
- Transcripción en tiempo real con Whisper API
- Recomendaciones de IA para el agente usando GPT-4o
- Conversión de audio webm a wav usando Web Audio API (sin FFmpeg)
- Almacenamiento local de transcripciones en Chrome Storage
- Detección de sentimientos del cliente

## Arquitectura

El proyecto ahora funciona completamente como extensión de Chrome sin servidor externo:

```
Extension Architecture:
├── Popup UI
│   ├── Configurar API Key
│   ├── Iniciar/Detener grabación
│   └── Ver transcripciones y recomendaciones
├── Background Service Worker
│   ├── Procesar audio con Web Audio API
│   ├── Convertir webm → wav
│   ├── Llamar a Whisper API (transcripción)
│   └── Llamar a GPT-4o API (recomendaciones)
└── Recorder Tab
    ├── Capturar audio del sistema
    ├── Capturar audio del micrófono
    └── Enviar chunks al background
```

## Archivos Principales

- [manifest.json](file:///c:/Users/agustin.bouzon/Documents/auditorIA-plugin/manifest.json) - Configuración de la extensión
- [src/background/background.js](file:///c:/Users/agustin.bouzon/Documents/auditorIA-plugin/src/background/background.js) - Lógica principal de la extensión
- [src/background/audioUtils.js](file:///c:/Users/agustin.bouzon/Documents/auditorIA-plugin/src/background/audioUtils.js) - Utilidades de conversión de audio
- [src/popup/popup.html](file:///c:/Users/agustin.bouzon/Documents/auditorIA-plugin/src/popup/popup.html) - Interfaz de usuario
- [src/recorder/recorder.js](file:///c:/Users/agustin.bouzon/Documents/auditorIA-plugin/src/recorder/recorder.js) - Captura de audio dual

## Solución de Problemas

### La extensión no carga

- Verifica que hayas cargado la carpeta correcta (debe contener `manifest.json`)
- Intenta recargar la extensión en `chrome://extensions/`

### No se transcribe el audio

- Asegúrate de haber configurado la API Key en el popup
- Verifica que la API Key sea válida y tenga saldo
- Confirma que hayas activado "Share system audio"
- Revisa la consola del navegador (F12) para errores

### El audio del cliente no se captura

- Verifica que hayas marcado "Share system audio" al seleccionar la pantalla
- Asegúrate de que el audio del sistema esté reproduciendo algo
- Algunas aplicaciones pueden bloquear la captura de audio del sistema

### Errores de API de OpenAI

- Verifica que la API Key sea válida
- Asegúrate de tener saldo disponible en tu cuenta
- Revisa que tu cuenta tenga acceso a las APIs de Whisper y GPT-4o

### Rendimiento lento

- La extensión procesa audio cada 5 segundos (configurable en `CHUNK_INTERVAL`)
- La conversión de audio puede consumir recursos en equipos antiguos
- Considera reducir el tamaño del buffer en `BUFFER_LIMIT` si hay problemas

## Costos de API

- **Whisper API:** ~$0.006 por minuto de audio
- **GPT-4o API:** ~$0.005 por 1K tokens (aproximadamente 750 palabras)

Para una llamada de 1 hora, el costo aproximado sería:
- Transcripción: ~$0.36 (Whisper)
- Recomendaciones: ~$0.50-$1.00 (GPT-4o, depende de la longitud de la conversación)

## Notas de Seguridad

- La API Key se almacena en `chrome.storage.local` (almacenamiento local del navegador)
- La key no se envía a ningún servidor excepto a los de OpenAI
- Considera usar una API Key con límites de uso para mayor seguridad

## Changelog

### v2.0
- Eliminado servidor Python - ahora funciona solo como extensión
- Conversión de audio usando Web Audio API (sin FFmpeg)
- Integración directa con OpenAI APIs desde JavaScript
- UI mejorada con configuración de API Key

### v1.0
- Versión inicial con servidor Python y WebSocket

## Licencia

Proyecto de código abierto para uso en call centers.
