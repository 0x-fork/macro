export interface ThreeColumnLayout {
  isInitialized: boolean;
  leftWidth: number;
  rightWidth: number;
  rightMargin: number;
  centerWidth: number | undefined;
  windowWidth: number | undefined;
  marginWidth: number;
}

interface ThreeColumnConfig {
  gutterPx: number;
  minLeftColumnWidth: number;
  minRightColumnWidth: number;
  maxLeftHandWidth: number;
  rightHandWidth: number;
}
