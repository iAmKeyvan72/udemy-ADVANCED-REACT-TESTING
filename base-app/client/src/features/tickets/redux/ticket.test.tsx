import axios from 'axios';
import { expectSaga } from 'redux-saga-test-plan';
import * as matchers from 'redux-saga-test-plan/matchers';
import { StaticProvider, throwError } from 'redux-saga-test-plan/providers';

import {
  holdReservation,
  purchasePayload,
  purchaseReservation,
} from '../../../test-utils/fake-data';
import { showToast } from '../../toast/redux/toastSlice';
import {
  cancelPurchaseServerCall,
  releaseServerCall,
  reserveTicketServerCall,
} from '../api';
import { TicketAction } from '../types';
import {
  cancelTransaction,
  generateErrorToastOptions,
  purchaseTickets,
  ticketFlow,
} from './ticketSaga';
import {
  endTransaction,
  resetTransaction,
  selectors,
  startTicketAbort,
  startTicketPurchase,
  startTicketRelease,
} from './ticketSlice';

const holdAction = {
  type: 'test',
  payload: holdReservation,
};

const providers: StaticProvider[] = [
  [matchers.call.fn(reserveTicketServerCall), null],
  [matchers.call.fn(releaseServerCall), null],
  [matchers.call.fn(cancelPurchaseServerCall), null],
];

test('cancelTransaction cancels hold and resets transaction', () => {
  return expectSaga(cancelTransaction, holdReservation)
    .provide(providers)
    .call(releaseServerCall, holdReservation)
    .put(resetTransaction())
    .run();
});

describe('common to all flows', () => {
  test('stars with hold call to server', () => {
    return expectSaga(ticketFlow, holdAction)
      .provide(providers)
      .dispatch(
        startTicketRelease({
          reservation: holdReservation,
          reason: 'Released!',
        })
      )
      .call(reserveTicketServerCall, holdReservation)
      .run();
  });

  test('show error toast and clean up after server error', () => {
    return expectSaga(ticketFlow, holdAction)
      .provide([
        [
          matchers.call.fn(reserveTicketServerCall),
          throwError(new Error("it didn't work well")),
        ],
        [
          matchers.select.selector(selectors.getTicketAction),
          TicketAction.hold,
        ],
        ...providers,
      ])
      .put(
        showToast(
          generateErrorToastOptions("it didn't work well", TicketAction.hold)
        )
      )
      .call(cancelTransaction, holdReservation)
      .run();
  });
});

describe('hold cancellation', () => {
  test.each([
    { name: 'cancel', actionCreator: startTicketRelease },
    { name: 'abort', actionCreator: startTicketAbort },
  ])(
    'cancels hold and resets ticket transaction on $name',
    ({ actionCreator }) => {
      return expectSaga(ticketFlow, holdAction)
        .provide(providers)
        .dispatch(
          actionCreator({ reservation: holdReservation, reason: 'canceled' })
        )
        .call(reserveTicketServerCall, holdReservation)
        .put(showToast({ title: 'canceled', status: 'warning' }))
        .call(cancelTransaction, holdReservation)
        .run();
    }
  );
});

describe('purchase flow', () => {
  test('network error on purchase shows toast and cancels transaction', () => {
    return expectSaga(ticketFlow, holdAction)
      .provide([
        [
          matchers.call.like({
            fn: reserveTicketServerCall,
            args: [purchaseReservation],
          }),
          throwError(new Error('sth bad happened here')),
        ],
        [
          matchers.select.selector(selectors.getTicketAction),
          TicketAction.hold,
        ],
        ...providers,
      ])
      .dispatch(startTicketPurchase(purchasePayload))
      .call(reserveTicketServerCall, holdReservation)
      .call.fn(cancelPurchaseServerCall)
      .put(
        showToast(
          generateErrorToastOptions('sth bad happened here', TicketAction.hold)
        )
      )
      .call(cancelTransaction, holdReservation)
      .run();
  });

  test('abort purchase while call to server is running', () => {
    const cancelSource = axios.CancelToken.source();
    return expectSaga(purchaseTickets, purchasePayload, cancelSource)
      .provide([
        ...providers,
        {
          race: () => ({ abort: true }),
        },
      ])

      .call(cancelSource.cancel)
      .call(cancelPurchaseServerCall, purchaseReservation)
      .put(showToast({ title: 'purchase canceled', status: 'warning' }))
      .call(cancelTransaction, holdReservation)
      .not.put(showToast({ title: 'tickets purchased', status: 'success' }))
      .run();
  });

  test('success purchase', () => {
    const cancelSource = axios.CancelToken.source();
    return expectSaga(purchaseTickets, purchasePayload, cancelSource)
      .provide(providers)
      .call(reserveTicketServerCall, purchaseReservation, cancelSource.token)
      .put(showToast({ title: 'tickets purchased', status: 'success' }))
      .call(releaseServerCall, holdReservation)
      .put(endTransaction())
      .not.call.fn(cancelSource.cancel)
      .not.call.fn(cancelPurchaseServerCall)
      .not.put(showToast({ title: 'purchase canceled', status: 'warning' }))
      .run();
  });
});
