// <burger-next-cards> is defined by burgerfun.ca's injected /shared/next.js.
// Outside the site it stays an undefined, empty element.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'burger-next-cards': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        kind?: string;
        game?: string;
        layout?: 'row' | 'compact';
        tone?: 'dark' | 'light';
      };
    }
  }
}
