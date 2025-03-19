# env-swap

An interactive terminal-based environment file switcher that helps you manage multiple `.env` files with ease.

## Features

- Interactive terminal UI using blessed
- Easy switching between different environment configurations
- Simple and intuitive interface
- No dependencies on external services

## Installation

```bash
npm install -g env-swap
```

Also expects git to be installed.

## Usage

Expects `.env` to have blocked sections like

```
NODE_ENV=Development
USER=egriff38

## Dev
API_TOKEN=ABC123

## Staging
# API_TOKEN=XYZ890

```

1. Navigate to your project directory containing your `.env` files
2. Run the command:
   ```bash
   env-swap
   ```
3. Use the arrow keys and space bar to select which blocks should be commented
4. Press Enter to apply the block commenting and exit, or
5. Press q to quit

## Development

To install dependencies and run the project locally:

```bash
npm install
```

## License

MIT

## Author

egriff38 (Created with Claude and Cursor)
