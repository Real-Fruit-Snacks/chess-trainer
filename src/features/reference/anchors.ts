/**
 * The ids the Reference page gives its glossary terms and questions, so a link from elsewhere
 * (quick search) lands on one: `/reference#glossary-zugzwang`.
 */
function anchorSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const glossaryAnchor = (term: string): string => `glossary-${anchorSlug(term)}`;

export const faqAnchor = (question: string): string => `faq-${anchorSlug(question)}`;
