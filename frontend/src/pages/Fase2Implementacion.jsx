import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileText } from '../lib/icons';
import SEOHead, { breadcrumbSchema } from '../components/SEOHead';
import markdown from '../../../docs/sprints/Sprint2/cuestionarios&dudas/Fase 2 - Implementación.md?raw';

function inlineMarkdown(value, keyPrefix) {
  const parts = value.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.9em] text-brand-dark">{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return <a key={key} href={link[2]} className="font-medium text-brand underline underline-offset-2 hover:text-brand-dark">{link[1]}</a>;
    }
    return part;
  });
}

function MarkdownContent() {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let inCode = false;
  let codeLines = [];
  let listItems = [];
  let listType = null;

  const flushList = () => {
    if (!listItems.length) return;
    const List = listType === 'ol' ? 'ol' : 'ul';
    blocks.push(
      <List key={`list-${blocks.length}`} className={`${listType === 'ol' ? 'list-decimal' : 'list-disc'} mb-5 space-y-1 pl-6 text-gray-700`}>
        {listItems.map((item, itemIndex) => <li key={itemIndex} className="pl-1 leading-7">{inlineMarkdown(item, `item-${itemIndex}`)}</li>)}
      </List>,
    );
    listItems = [];
    listType = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('```')) {
      if (inCode) {
        flushList();
        blocks.push(
          <pre key={`code-${index}`} className="overflow-x-auto rounded-xl bg-gray-950 p-4 my-5 text-sm leading-6 text-gray-100">
            <code>{codeLines.join('\n')}</code>
          </pre>,
        );
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const unordered = line.match(/^\s*-\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = ordered ? 'ol' : 'ul';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)[1]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={`rule-${index}`} className="my-8 border-0 border-t border-gray-200" />);
      continue;
    }
    if (/^\|.*\|$/.test(line) && !/^\|[\s|:-]+\|$/.test(line)) {
      const rows = [];
      let tableIndex = index;
      while (tableIndex < lines.length && /^\|.*\|$/.test(lines[tableIndex])) {
        if (!/^\|[\s|:-]+\|$/.test(lines[tableIndex])) {
          rows.push(lines[tableIndex].split('|').slice(1, -1).map((cell) => cell.trim()));
        }
        tableIndex += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="mb-6 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-900">
              <tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex} className="px-4 py-3 font-semibold">{inlineMarkdown(cell, `head-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex} className="align-top">
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 text-gray-700">{inlineMarkdown(cell, `cell-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      index = tableIndex - 1;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const headingClasses = {
        1: 'mb-7 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl',
        2: 'mt-12 mb-4 border-b border-gray-200 pb-2 text-2xl font-bold text-gray-900',
        3: 'mt-8 mb-3 text-xl font-bold text-gray-900',
        4: 'mt-6 mb-2 text-lg font-semibold text-gray-900',
      };
      const Heading = `h${level}`;
      blocks.push(<Heading key={index} className={headingClasses[level]}>{inlineMarkdown(heading[2], `h${level}-${index}`)}</Heading>);
    } else if (line.trimStart().startsWith('> ')) {
      blocks.push(<blockquote key={index} className="my-5 border-l-4 border-brand bg-brand/5 px-4 py-3 text-gray-600">{inlineMarkdown(line.trimStart().slice(2), `quote-${index}`)}</blockquote>);
    } else {
      blocks.push(<p key={index} className="mb-4 leading-7 text-gray-700">{inlineMarkdown(line, `p-${index}`)}</p>);
    }
  }

  flushList();
  return blocks;
}

export default function Fase2Implementacion() {
  const downloadDocument = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Fase 2 - Implementación.md';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead
        title="Fase 2 - Implementación"
        description="Documento de implementación de la Fase 2 ERP de Greenline."
        url="/fase-2-implementacion"
        jsonLd={[breadcrumbSchema([
          { name: 'Inicio', url: '/' },
          { name: 'Fase 2 - Implementación', url: '/fase-2-implementacion' },
        ])]}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-dark">
            <ArrowLeft className="w-4 h-4" />
            Volver al panel
          </Link>
          <button
            type="button"
            onClick={downloadDocument}
            className="inline-flex items-center gap-2 rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5"
          >
            <Download className="w-4 h-4" />
            Descargar Markdown
          </button>
        </div>

        <article className="rounded-2xl border border-gray-200 bg-white px-5 py-7 shadow-sm sm:px-10 sm:py-10">
          <div className="flex items-center gap-3 border-b border-gray-200 pb-5 mb-7">
            <FileText className="w-7 h-7 text-brand" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">Documento interno</p>
              <p className="text-sm text-gray-500">Fase 2 del ERP Greenline</p>
            </div>
          </div>
          <div>{MarkdownContent()}</div>
        </article>
      </div>
    </div>
  );
}
