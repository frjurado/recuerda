# Recuerda - PRD

## Overview
Aplicación móvil Expo (Android-first) para recordar cumpleaños y aniversarios mediante repetición espaciada al estilo Anki (SM-2).

## Idioma
Español únicamente.

## Autenticación
- Emergent Google Auth (OAuth)
- Almacenamiento de session_token en `expo-secure-store` (móvil) y `localStorage` (web)

## Funcionalidades Core
1. **Login con Google** (Emergent-managed)
2. **Eventos anuales** (sin año): nombre, día, mes, tipo (cumpleaños/aniversario/otro). CRUD completo.
3. **Flashcards SM-2** "¿Cuándo es el cumpleaños de X?" con calificaciones Otra vez / Difícil / Bien / Fácil
4. **Recordatorios calendáricos** auto-generados:
   - 1 mes antes: "¿Quién cumple años dentro de un mes?"
   - 1 semana antes: "¿Quién cumple años dentro de una semana?"
   - El día: tarjeta festiva con CTAs Llamar / Escribir
5. **Calendario mensual** mostrando eventos
6. **Ajustes**: activar notificaciones diarias y elegir hora (expo-notifications)

## Diseño
- Esquinas RECTAS (borderRadius: 0)
- Colores claros + bordes negros gruesos + sombras hard offset (Neo-Brutalist)
- Acento amarillo (#FFD93D), azul (#4D96FF)

## Stack
- Frontend: Expo SDK 54 + Expo Router + React Native 0.81
- Backend: FastAPI + Motor (MongoDB)
- Notificaciones: expo-notifications (daily trigger)

## API Endpoints
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/session` | Intercambio session_id Google → session_token |
| GET  | `/api/auth/me` | Datos usuario actual |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET  | `/api/events` | Listar eventos |
| POST | `/api/events` | Crear evento |
| PUT  | `/api/events/{id}` | Editar evento |
| DELETE | `/api/events/{id}` | Borrar evento |
| GET  | `/api/reviews/due` | Tarjetas por repasar hoy |
| POST | `/api/reviews/grade` | Calificar tarjeta (SM-2) |
| GET  | `/api/reviews/has-due` | Contador de tarjetas pendientes |
| GET  | `/api/settings` | Ajustes notificaciones |
| PUT  | `/api/settings` | Actualizar ajustes |

## Modelo SM-2
- ef inicial 2.5, mínimo 1.3
- Grade 0 (Again): reset reps=0, interval=1, ef -= 0.2
- Grade 1 (Hard): interval ×0.7, ef -= 0.15
- Grade 2 (Good): SM-2 standard (1d, 6d, then interval × ef)
- Grade 3 (Easy): interval × 1.3, ef += 0.15
