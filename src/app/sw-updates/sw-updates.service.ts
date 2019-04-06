import { ApplicationRef, Injectable, OnDestroy } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { concat, interval, NEVER, Observable, Subject } from 'rxjs';
import { first, map, takeUntil, tap } from 'rxjs/operators';

import { Logger } from 'app/shared/logger.service';


/**
 * SwUpdatesService
 *
 * @description
 * 1. 한 번 인스턴스화 된 사용 가능한 ServiceWorker 업데이트를 확인합니다.
 * 2. 6 시간마다 재확인.
 * 3. 업데이트가있을 때마다 업데이트를 활성화합니다.
 *
 * @property
 * `updateActivated` {Observable<string>} - 업데이트가 활성화 될 때마다 버전 해시를 내 보냅니다.
 */
@Injectable()
export class SwUpdatesService implements OnDestroy {
  private checkInterval = 1000 * 60 * 60 * 6;  // 6 hours
  private onDestroy = new Subject<void>();
  updateActivated: Observable<string>;

  constructor(appRef: ApplicationRef, private logger: Logger, private swu: SwUpdate) {
    if (!swu.isEnabled) {
      this.updateActivated = NEVER.pipe(takeUntil(this.onDestroy));
      return;
    }

    // 업데이트가 정기적으로 확인됩니다 (앱이 안정화 된 후).
    const appIsStable = appRef.isStable.pipe(first(v => v));
    concat(appIsStable, interval(this.checkInterval))
        .pipe(
            tap(() => this.log('Checking for update...')),
            takeUntil(this.onDestroy),
        )
        .subscribe(() => this.swu.checkForUpdate());

    // 사용 가능한 업데이트를 활성화하십시오.
    this.swu.available
        .pipe(
            tap(evt => this.log(`Update available: ${JSON.stringify(evt)}`)),
            takeUntil(this.onDestroy),
        )
        .subscribe(() => this.swu.activateUpdate());

    // 활성화 된 업데이트에 대해 알립니다.
    this.updateActivated = this.swu.activated.pipe(
        tap(evt => this.log(`Update activated: ${JSON.stringify(evt)}`)),
        map(evt => evt.current.hash),
        takeUntil(this.onDestroy),
    );
  }

  ngOnDestroy() {
    this.onDestroy.next();
  }

  private log(message: string) {
    const timestamp = (new Date).toISOString();
    this.logger.log(`[SwUpdates - ${timestamp}]: ${message}`);
  }
}
