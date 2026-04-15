import type { Preview } from '@storybook/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/ko.json';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="ko" messages={messages} timeZone="Asia/Seoul">
        <Story />
      </NextIntlClientProvider>
    ),
  ],
};

export default preview;
