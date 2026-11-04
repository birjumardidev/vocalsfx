export type SoundEffect = {
  id: string | number;
  name: string;
  duration: number;
  preview_url: string | null;
  tags: string[];
  license: string;
  download_url: string | null;
  source_url: string;
  match_score?: number;
};
