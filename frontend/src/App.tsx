import { useEffect, useState } from 'react';

type Greeting =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly text: string }
  | { readonly state: 'failed'; readonly status: number };

/** Greets whoever signed in, as the origin service does. */
export function App() {
  const [greeting, setGreeting] = useState<Greeting>({ state: 'loading' });

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/hello');

      setGreeting(
        response.ok
          ? { state: 'loaded', text: await response.text() }
          : { state: 'failed', status: response.status },
      );
    })();
  }, []);

  switch (greeting.state) {
    case 'loading':
      return <p>Loading…</p>;
    case 'loaded':
      return <h1>{greeting.text}</h1>;
    case 'failed':
      return <p>The greeting failed with {greeting.status}.</p>;
  }
}
