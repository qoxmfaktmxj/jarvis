import type { Meta, StoryObj } from '@storybook/react';
import { WikiPageView } from './WikiPageView';
import { MOCK_WIKI_PAGES, type WikiPage } from './mockWikiPages';

const onWikiLinkClick = (slug: string) => console.log('wikilink clicked:', slug);

const findPage = (slug: string): WikiPage => {
  const page = MOCK_WIKI_PAGES.find((p) => p.slug === slug);
  if (!page) {
    throw new Error(`MOCK_WIKI_PAGES에서 slug=${slug}를 찾지 못했습니다.`);
  }
  return page;
};

const meta: Meta<typeof WikiPageView> = {
  title: 'Wiki/WikiPageView',
  component: WikiPageView,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    onWikiLinkClick,
  },
};

export default meta;
type Story = StoryObj<typeof WikiPageView>;

// 1. PublicPage — sensitivity=public
export const PublicPage: Story = {
  args: {
    page: findPage('hr/leaves/sick-leave'),
  },
};

// 2. InternalPage — sensitivity=internal
export const InternalPage: Story = {
  args: {
    page: findPage('it/security/password-policy'),
  },
};

// 3. WithWikiLinks — [[wikilink]] 패턴이 다수 포함된 인덱스 페이지
export const WithWikiLinks: Story = {
  args: {
    page: findPage('index'),
  },
};

// 4. RestrictedPage — sensitivity=restricted
export const RestrictedPage: Story = {
  args: {
    page: findPage('legal/contracts/nda'),
  },
};
