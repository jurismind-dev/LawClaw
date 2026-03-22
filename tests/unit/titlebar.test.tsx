import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TitleBar } from '@/components/layout/TitleBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('title bar coin access visibility', () => {
  it('hides the coin access button on setup routes', () => {
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <TitleBar />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'brand.getCoins' })).not.toBeInTheDocument();
  });

  it('keeps the coin access button on non-setup routes', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TitleBar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'brand.getCoins' })).toBeInTheDocument();
  });
});
