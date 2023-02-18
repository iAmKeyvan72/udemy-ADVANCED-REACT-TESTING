import { PayloadAction } from '@reduxjs/toolkit';
import { expectSaga } from 'redux-saga-test-plan';

import { ToastOptions } from '../types';
import { logErrorToast, logErrorToasts } from './LogErrorToastSaga';

const errorToastOptions: ToastOptions = {
  title: 'Showwww fooking error',
  status: 'error',
};

const errorToastAction: PayloadAction<ToastOptions> = {
  type: 'test',
  payload: errorToastOptions,
};

test('saga calls analytics when faces error', () => {
  return expectSaga(logErrorToasts, errorToastAction)
    .call(logErrorToast, 'Showwww fooking error')
    .run();
});

const notErrorToastOptions: ToastOptions = {
  title: "This won't be a fooookin error",
  status: 'warning',
};

const notErrorToastOptionsAction: PayloadAction<ToastOptions> = {
  type: 'warningTest',
  payload: notErrorToastOptions,
};

test('do not send analytics data when there is no foookin error', async () => {
  await expectSaga(logErrorToasts, notErrorToastOptionsAction)
    .not.call.fn(logErrorToast)
    .run();
});
