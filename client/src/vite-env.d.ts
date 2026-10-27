/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_ADSENSE_SLOT_TIMER?: string;
  readonly VITE_ADSENSE_SLOT_COMPETITIONS?: string;
  readonly VITE_ADSENSE_SLOT_RESULTS?: string;
  readonly VITE_ADSENSE_SLOT_FOOTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
