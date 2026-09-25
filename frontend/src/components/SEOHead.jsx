import { Helmet } from 'react-helmet-async';
import { CONTACT, BRAND } from '../lib/config';
import { LOGO } from '../lib/images';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://greenlineperu.com';
const DEFAULT_IMAGE = LOGO;

/**
 * Componente SEOHead — gestiona todos los metadatos de la página:
 * title, description, Open Graph, Twitter Card, canonical y JSON-LD.
 *
 * Uso:
 *   <SEOHead
 *     title="Tienda de movilidad eléctrica"
 *     description="Descripción..."
 *  *     image={LOGO} // o cualquier URL/usando img() de lib/images
 *     type="website" | "product" | "article"
 *     keywords={[...]}
 *     jsonLd={[{...}, ...]}
 *   />
 */
export default function SEOHead({
  title,
  description,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  keywords = [],
  jsonLd = [],
}) {
  const fullTitle = title ? `${title} | ${BRAND.name}` : BRAND.name;
  const canonicalUrl = url ? `${SITE_URL}${url}` : SITE_URL;
  const fullImage = image.startsWith('http') ? image : `${SITE_URL}${image}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(', ')} />
      )}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:site_name" content={BRAND.name} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:locale" content="es_PE" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />

      {/* JSON-LD Structured Data */}
      {jsonLd.length > 0 && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}

/** Schema base de la organización (para usar en todas las páginas) */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.legalName,
    legalName: BRAND.legalName,
    url: SITE_URL,
    logo: DEFAULT_IMAGE,
    foundingDate: '2017',
    address: {
      '@type': 'PostalAddress',
      streetAddress: CONTACT.address,
      addressLocality: 'Lima',
      addressCountry: 'PE',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: CONTACT.phone,
      contactType: 'customer service',
      email: CONTACT.email,
    },
    sameAs: [
      'https://www.facebook.com/GreenLinePeru/',
      'https://www.instagram.com/greenline_peru/',
      'https://www.youtube.com/@GreenLinePeru',
      'https://www.linkedin.com/company/greenline-peru/',
      'https://www.tiktok.com/@greenline_peru',
    ],
  };
}

/** BreadcrumbList schema */
export function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

/** Product schema para la página de producto */
export function productSchema(product) {
  const image = product.imagenes?.find((i) => i.es_principal)?.src || product.imagenes?.[0]?.src;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nombre,
    image: image || DEFAULT_IMAGE,
    description: product.descripcion || `${product.nombre} - Vehículo de movilidad eléctrica GreenLine`,
    sku: product.id,
    category: product.categoria,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'PEN',
      price: product.precio_actual,
      availability: product.disponibilidad === 'Fuera de stock'
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      url: `${SITE_URL}/producto/${product.slug}`,
    },
    brand: {
      '@type': 'Brand',
      name: BRAND.legalName,
    },
  };
}

/** Article schema para el blog */
export function articleSchema(article, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt || '',
    image: article.image_url || DEFAULT_IMAGE,
    datePublished: article.published_at,
    dateModified: article.updated_at || article.published_at,
    author: {
      '@type': 'Organization',
      name: BRAND.legalName,
    },
    publisher: {
      '@type': 'Organization',
      name: BRAND.legalName,
      logo: {
        '@type': 'ImageObject',
        url: DEFAULT_IMAGE,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

/** FAQ schema */
export function faqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };
}
