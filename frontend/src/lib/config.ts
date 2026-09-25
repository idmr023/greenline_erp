/**
 * Configuración central de Green Line
 *
 * Fuente única de datos de contacto, redes sociales y valores de negocio.
 * Los textos de las páginas deben leer de aquí en lugar de duplicar literales.
 */

export const CONTACT = {
  /** Teléfono principal para mostrar en el sitio */
  phoneDisplay: '+51 919 445 661',
  /** Teléfono en formato E.164 (sin espacios) */
  phone: '+51919445661',
  /** Número de WhatsApp sin código de país (para wa.me) */
  whatsappNumber: '51919445661',
  whatsappUrl: 'https://wa.me/51919445661',
  /** Correo principal. TODO: reemplazar por el correo oficial de la empresa */
  email: 'greenlinemoto@gmail.com',
  // emailSoporte: 'soporte@greenlineperu.com',
  emailRRHH: 'pe_asistente@migreenline.com',
  // emailPrivacidad: 'privacidad@greenlineperu.com',
  address: 'Av. Gral. Juan Antonio Álvarez de Arenales 1912, Lima 15073',
  city: 'Lima, Perú',
};

/** Construye un enlace de WhatsApp con mensaje prellenado */
export const buildWhatsAppLink = (message) =>
  `${CONTACT.whatsappUrl}?text=${encodeURIComponent(message)}`;

export const SOCIAL = {
  facebook: 'https://www.facebook.com/GreenLinePeru/',
  instagram: 'https://www.instagram.com/greenline_peru/',
  youtube: 'https://www.youtube.com/@GreenLinePeru',
  linkedin: 'https://www.linkedin.com/company/greenline-peru/',
  tiktok: 'https://www.tiktok.com/@greenline_peru',
  tiktok_aniversario: 'https://www.tiktok.com/@greenline_peru/video/7680709590303919381?is_from_webapp=1&sender_device=pc',
  instagram_aniversario: 'https://www.instagram.com/reel/DcoNbZmDS7S/?utm_source=ig_web_copy_link&igsi=NTc4MTIwNjQ2YQ==',
  instagram_greentips: 'https://www.instagram.com/reel/Dc6PB-FAXxE/?utm_source=ig_web_copy_link&stkn=MzRlODBiNWFlZA==',
  instagram_comunidad: 'https://www.instagram.com/channel/uYoQ8IghNwmaQ3cw/',
  whatsapp_comunidad: 'https://whatsapp.com/channel/0029Va1WNsKEawdkZ43obV1f'
};

export const BRAND = {
  name: 'GreenLine',
  legalName: 'Green Line SAC',
  founded: 2017,
};