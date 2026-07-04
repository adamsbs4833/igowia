(function () {
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdownLite(rawText) {
    const escaped = escapeHtml(rawText);
    const codeBlocks = [];

    let result = escaped.replace(/```([\s\S]*?)```/g, (match, code) => {
      const index = codeBlocks.length;
      const cleaned = code.replace(/^\n/, '').replace(/\n$/, '');
      codeBlocks.push(`<pre><code>${cleaned}</code></pre>`);
      return `@@CODEBLOCK${index}@@`;
    });

    result = result.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    result = result.replace(/\n/g, '<br>');

    result = result.replace(/@@CODEBLOCK(\d+)@@/g, (match, idx) => codeBlocks[Number(idx)]);

    return result;
  }

  window.igowiaRenderMarkdown = renderMarkdownLite;
  window.igowiaEscapeHtml = escapeHtml;
})();
