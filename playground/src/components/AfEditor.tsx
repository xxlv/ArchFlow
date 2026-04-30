import Editor, { type BeforeMount, type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import type { Diagnostic } from "../compiler/types";

type AfEditorProps = {
  source: string;
  diagnostics: Diagnostic[];
  selectedLine?: number;
  onChange: (value: string) => void;
  onLineFocus: (line: number) => void;
};

export function AfEditor({ source, diagnostics, selectedLine, onChange, onLineFocus }: AfEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | undefined>(undefined);
  const monacoRef = useRef<Monaco | undefined>(undefined);
  const selectionDecorations = useRef<editor.IEditorDecorationsCollection | undefined>(undefined);

  const beforeMount: BeforeMount = (monaco) => {
    if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === "archflow")) {
      monaco.languages.register({ id: "archflow" });
    }
    monaco.languages.setMonarchTokensProvider("archflow", {
      tokenizer: {
        root: [
          [/#[^\n]*/, "comment"],
          [/\.[^:]+:/, "attribute.name"],
          [/@[A-Za-z_]\w*/, "type.identifier"],
          [/\$[A-Za-z_]\w*/, "tag"],
          [/\[[^\]]+\]/, "string"],
          [/\([^)]+\)/, "number"],
          [/![A-Za-z_]\w*/, "keyword"],
          [/=>|>>/, "operator"],
        ],
      },
    });
  };

  const onMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    selectionDecorations.current = editorInstance.createDecorationsCollection();
    editorInstance.onDidChangeCursorPosition((event) => onLineFocus(event.position.lineNumber));
  };

  useEffect(() => {
    const model = editorRef.current?.getModel();
    const monaco = monacoRef.current;
    if (!model || !monaco) {
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      "archflow",
      diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: diagnostic.message,
        startLineNumber: diagnostic.line ?? 1,
        endLineNumber: diagnostic.line ?? 1,
        startColumn: 1,
        endColumn: model.getLineMaxColumn(diagnostic.line ?? 1),
      })),
    );
  }, [diagnostics]);

  useEffect(() => {
    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;
    const decorations = selectionDecorations.current;
    if (!editorInstance || !monaco || !decorations) {
      return;
    }

    if (!selectedLine) {
      decorations.clear();
      return;
    }

    decorations.set([
      {
        range: new monaco.Range(selectedLine, 1, selectedLine, 1),
        options: {
          isWholeLine: true,
          className: "source-line-selected",
          glyphMarginClassName: "source-line-glyph",
        },
      },
    ]);
    editorInstance.revealLineInCenterIfOutsideViewport(selectedLine);
  }, [selectedLine]);

  return (
    <Editor
      beforeMount={beforeMount}
      defaultLanguage="archflow"
      height="100%"
      onChange={(value) => onChange(value ?? "")}
      onMount={onMount}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        glyphMargin: true,
        lineNumbersMinChars: 3,
      }}
      theme="vs-dark"
      value={source}
    />
  );
}
