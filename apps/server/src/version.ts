import rootPackage from '../../../package.json' with { type: 'json' };

/** App version from the root package.json (inlined when bundled). */
export const appVersion: string = rootPackage.version;
