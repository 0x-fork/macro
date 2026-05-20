import Color from 'colorjs.io';
import { match } from 'ts-pattern';

export function validateColor(color: string): boolean{
  return CSS.supports('color', color);
}

export function getOklch(cssColor: string){
  const color = new Color(cssColor);
  const convert = color.to('oklch');

  let l = convert.coords[0] ? convert.coords[0] : 0;
  let c = convert.coords[1] ? convert.coords[1] : 0;
  let h = convert.coords[2] ? convert.coords[2] : 0;

  let returnColor = { l: l, c: c, h: h };
  return returnColor;
}

export function convertOklchTo(l: number, c: number, h: number, type: string){
  // console.log(`oklch values: L=${l}, C=${c}, H=${h} | type: ${type}`);
  try{
    const lightness = Math.max(0, Math.min(1, l));
    const chroma = Math.max(0, c < 1e-10 ? 0 : c);
    const hue = h;

    const color = new Color('oklch', [lightness, chroma, hue]);

    return match(type)
      .with('hex', () => color.to('srgb').toString({ precision: 4, format: 'hex' }))
      .with('rgb', () => color.to('srgb').toString({ precision: 4, format: 'rgb' }))
      .with('oklab', () => color.to('oklab').toString({ precision: 4 }))
      .with('hsl', () => color.to('hsl').toString({ precision: 4 }))
      .with('oklch', () => color.toString({ precision: 4 }))
      .otherwise(() => color.to('srgb').toString({ format: 'hex' }));
  }
  catch(error){
    console.error(error);
    return '#000000';
  }
}
