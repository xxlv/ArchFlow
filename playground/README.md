# ArchFlow Playground

Static browser playground for editing `.af` architecture files and inspecting the resulting contract topology.

## Features

- Monaco-based `.af` editor with syntax highlighting.
- Browser-side parser and validator for the current MVP grammar.
- C4-like SVG topology view for `@Component => [Channel] => @Component`.
- Bidirectional source and diagram linking.
- Diagnostics and inspector panels with source-line navigation.

## Development

```bash
npm install
npm run dev
```

Build the static site:

```bash
npm run build
```

The app is fully static and can be deployed from `dist/` after building.
