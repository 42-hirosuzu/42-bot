# 42-bot

A Discord bot for creating lightweight hangout events and managing participation inside a Discord server.

## Features

- Create hangout events
- Join, mark interest, or leave an event
- View active events
- Show nearby spot suggestions
- Close events created by the user

## Commands

| Command | Description |
| --- | --- |
| `/hangout` | Create a new event |
| `/events` | Show active events |
| `/spot` | Show spot suggestions |
| `/event_close` | Close an event |

## Tech Stack

- TypeScript
- Node.js
- discord.js
- SQLite

## Setup

Run the following commands:

    pnpm install
    cp .env.example .env
    pnpm register:guild
    pnpm dev

## Environment Variables

Create `.env` from `.env.example`.

## Development

Run type checking:

    pnpm typecheck

## License

TBD
