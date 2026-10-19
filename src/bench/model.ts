interface ModelSource {
  readonly name: string;
  readonly title: string;
  readonly slug: string;
  readonly repository: string;
  readonly commit: string;
  readonly page: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly credit: string;
}

const MODELS = {
  ABeautifulGame: {
    name: 'ABeautifulGame',
    title: 'A Beautiful Game',
    slug: 'a-beautiful-game',
    repository: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
    commit: 'edc7c9e67c639d230715049ee31f9a96a6babbbe',
    page: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/ABeautifulGame',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/ABeautifulGame/glTF-Binary/ABeautifulGame.glb',
    bytes: 42_977_928,
    sha256: 'bd7133b4b322aae97c589b8839dae8155ad2546acb35ae32a127e722a959d007',
    licence: 'CC-BY-4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit:
      '© 2020 ASWF, MaterialX Project (original model by Moeen Sayed and Mujtaba Sayed for SideFX), © 2022 Ed Mackey (conversion to glTF), CC BY 4.0',
  },
  CommercialRefrigerator: {
    name: 'CommercialRefrigerator',
    title: 'Commercial Refrigerator',
    slug: 'commercial-refrigerator',
    repository: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
    commit: '350c5003b50a86fa0a712a8e0dcd00a7fddaebb5',
    page: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/350c5003b50a86fa0a712a8e0dcd00a7fddaebb5/Models/CommercialRefrigerator',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/350c5003b50a86fa0a712a8e0dcd00a7fddaebb5/Models/CommercialRefrigerator/glTF-Binary/CommercialRefrigerator.glb',
    bytes: 10_131_180,
    sha256: 'ef8da8b144e650c277ac953e6d9e50ac1689ff1ee88c2c5bd9551ae8bccb6065',
    licence: 'CC-BY-4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit:
      '© 2025 Eric Chadwick, Darmstadt Graphics Group GmbH (CC BY 4.0), based on "Commercial Fridge" by Sean Thomas (CC BY 4.0, https://sketchfab.com/3d-models/commercial-fridge-2174e1e4f1f24f1a95aa110ee060f473)',
  },
} satisfies Readonly<Record<string, ModelSource>>;

export const MODEL: ModelSource = MODELS.ABeautifulGame;

export const VARIANT_IDS = ['raw', 'opt', 'lod1', 'lod2'] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export const VARIANT_FILES: Readonly<Record<VariantId, string>> = {
  raw: `models/raw/${MODEL.name}.glb`,
  opt: `models/${MODEL.slug}/lod0.glb`,
  lod1: `models/${MODEL.slug}/lod1.glb`,
  lod2: `models/${MODEL.slug}/lod2.glb`,
};
