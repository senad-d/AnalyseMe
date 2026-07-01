export interface AnalyseMeCommandHelpSection {
  heading: string;
  body: string;
}

export interface AnalyseMeCommandState {
  mode: "help" | "config";
  sections: AnalyseMeCommandHelpSection[];
}
