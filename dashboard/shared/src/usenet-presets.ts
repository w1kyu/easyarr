/**
 * Usenet provider presets for wizard step 6 (SPEC §8 [VERIFY presets]). Every value was checked on
 * the provider's own help pages on 2026-11-01 (see `source`, PROGRESS.md → Verified facts) and the
 * SSL port was tried live. Providers whose SSL port or connection limit isn't on an official page
 * (Frugal Usenet, Usenet.Farm, Supernews) are left out — "Other provider" works for them.
 *
 * `connections` is the limit of the provider's smallest current plan, so a preset never makes the
 * provider refuse the user; bigger plans may allow more (the form says so).
 */
export interface UsenetProviderPreset {
  id: string;
  /** Product name (not translated). */
  name: string;
  host: string;
  /** SSL port. */
  port: number;
  /** Connections allowed on the provider's smallest current plan. */
  connections: number;
  signupUrl: string;
  /** Where the values come from. */
  source: string;
}

export const USENET_PROVIDER_PRESETS: readonly UsenetProviderPreset[] = [
  {
    id: 'easynews',
    name: 'Easynews',
    host: 'news.easynews.com',
    port: 563,
    connections: 60,
    signupUrl: 'https://signup.easynews.com/',
    source: 'https://help.easynews.com/kb/article/11-nntp-server-addresses/',
  },
  {
    id: 'eweka',
    name: 'Eweka',
    host: 'news.eweka.nl',
    port: 563,
    connections: 50,
    signupUrl: 'https://www.eweka.nl/en/pricing',
    source: 'https://help.eweka.nl/kb/article/961-how-many-connections-does-my-account-come-with/',
  },
  {
    id: 'giganews',
    name: 'Giganews',
    host: 'news.giganews.com',
    port: 563,
    connections: 20,
    signupUrl: 'https://giganews.com/signup/',
    source:
      'https://support.giganews.com/hc/en-us/articles/360039684831-What-is-the-Giganews-configuration-information',
  },
  {
    id: 'newsdemon',
    name: 'NewsDemon',
    host: 'news.newsdemon.com',
    port: 563,
    connections: 50,
    signupUrl: 'https://www.newsdemon.com/',
    source: 'https://www.newsdemon.com/usenet-setup-guide',
  },
  {
    id: 'newsgroupninja',
    name: 'Newsgroup Ninja',
    host: 'news.newsgroup.ninja',
    port: 563,
    connections: 50,
    signupUrl: 'https://www.newsgroup.ninja/en/signup',
    source: 'https://support.newsgroup.ninja/kb/article/515-other-newsreaders/',
  },
  {
    id: 'newshosting',
    name: 'Newshosting',
    host: 'news.newshosting.com',
    port: 563,
    connections: 30,
    signupUrl: 'https://controlpanel.newshosting.com/signup/',
    source: 'https://support.newshosting.com/kb/article/104-newshosting-nntp-server-information/',
  },
  {
    id: 'pureusenet',
    name: 'Pure Usenet',
    host: 'news.pureusenet.nl',
    port: 563,
    connections: 8,
    signupUrl: 'https://www.pureusenet.nl/en/cart',
    source: 'https://support.pureusenet.nl/kb/article/390-where-can-i-find-the-server-details/',
  },
  {
    id: 'thecubenet',
    name: 'theCubeNet',
    host: 'news.thecubenet.com',
    port: 563,
    connections: 20,
    signupUrl: 'https://www.thecubenet.com/',
    source:
      'https://www.thecubenet.com/clients/knowledgebase/1/What-are-the-server-addresses-and-ports.html',
  },
  {
    id: 'tweaknews',
    name: 'Tweaknews',
    host: 'news.tweaknews.eu',
    port: 563,
    connections: 30,
    signupUrl: 'https://www.tweaknews.eu/en/usenet-plans',
    source:
      'https://support.tweaknews.eu/kb/article/1752-general-configuration-guide-for-tweaknews-access/',
  },
  {
    id: 'usenetserver',
    name: 'UsenetServer',
    host: 'news.usenetserver.com',
    port: 563,
    connections: 20,
    signupUrl: 'https://accounts.usenetserver.com/register',
    source: 'https://support.usenetserver.com/kb/article/298-server-and-ports/',
  },
  {
    id: 'vipernews',
    name: 'ViperNews',
    host: 'news.vipernews.com',
    port: 563,
    connections: 5,
    signupUrl: 'https://www.vipernews.com/sign-up/',
    source: 'https://www.vipernews.com/usenet/clients/sabnzbd/',
  },
];
