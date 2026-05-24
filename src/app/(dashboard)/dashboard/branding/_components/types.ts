// Общие типы, разделяемые между компонентами конструктора КП.

export type InitialMaster = {
  id: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  brandColor: string;
  address: string | null;
  logoUrl: string | null;
  tagline: string | null;
  coverPhotoUrl: string | null;
  warrantyMaterials: number;
  warrantyInstall: number;
};
