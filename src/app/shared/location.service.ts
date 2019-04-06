import { Injectable } from '@angular/core';
import { Location, PlatformLocation } from '@angular/common';

import { ReplaySubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';

// import { GaService } from 'app/shared/ga.service';
import { SwUpdatesService } from 'app/sw-updates/sw-updates.service';

@Injectable()
export class LocationService {

  private readonly urlParser = document.createElement('a');
  private urlSubject = new ReplaySubject<string>(1);
  private swUpdateActivated = false;

  currentUrl = this.urlSubject
    .pipe(map(url => this.stripSlashes(url)));

  currentPath = this.currentUrl.pipe(
    map(url => (url.match(/[^?#]*/) || [])[0]),  // strip query and hash
    // tap(path => this.gaService.locationChanged(path)),  // Google Analytics Service를 사용할 경우
  );

  constructor(
    // private gaService: GaService, // Google Analytics Service를 사용할 경우
    private location: Location,
    private platformLocation: PlatformLocation,
    swUpdates: SwUpdatesService) {

    this.urlSubject.next(location.path(true));

    this.location.subscribe(state => {
      return this.urlSubject.next(state.url || '');
    });

    swUpdates.updateActivated.subscribe(() => this.swUpdateActivated = true);
  }

  // TODO: ignore if url-without-hash-or-search matches current location?
  go(url: string|null|undefined) {
    if (!url) { return; }
    url = this.stripSlashes(url);
    if (/^http/.test(url) || this.swUpdateActivated) {
      // Has http protocol so leave the site
      // (or do a "full page navigation" if a ServiceWorker update has been activated)
      this.goExternal(url);
    } else {
      this.location.go(url);
      this.urlSubject.next(url);
    }
  }

  goExternal(url: string) {
    window.location.assign(url);
  }

  replace(url: string) {
    window.location.replace(url);
  }

  private stripSlashes(url: string) {
    return url.replace(/^\/+/, '').replace(/\/+(\?|#|$)/, '$1');
  }

  search() {
    const search: { [index: string]: string|undefined; } = {};
    const path = this.location.path();
    const q = path.indexOf('?');
    if (q > -1) {
      try {
          const params = path.substr(q + 1).split('&');
          params.forEach(p => {
            const pair = p.split('=');
            if (pair[0]) {
              search[decodeURIComponent(pair[0])] = pair[1] && decodeURIComponent(pair[1]);
            }
          });
      } catch (e) { /* don't care */ }
    }
    return search;
  }

  setSearch(label: string, params: { [key: string]: string|undefined}) {
    const search = Object.keys(params).reduce((acc, key) => {
      const value = params[key];
      return (value === undefined) ? acc :
        acc += (acc ? '&' : '?') + `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }, '');

    this.platformLocation.replaceState({}, label, this.platformLocation.pathname + search);
  }

  /**
   * Handle user's anchor click
   *
   * @param anchor {HTMLAnchorElement} - the anchor element clicked
   * @param button Number of the mouse button held down. 0 means left or none
   * @param ctrlKey True if control key held down
   * @param metaKey True if command or window key held down
   * @return false if service navigated with `go()`; true if browser should handle it.
   *
   * Since we are using `LocationService` to navigate between docs, without the browser
   * reloading the page, we must intercept clicks on links.
   * If the link is to a document that we will render, then we navigate using `Location.go()`
   * and tell the browser not to handle the event.
   *
   * In most apps you might do this in a `LinkDirective` attached to anchors but in this app
   * we have a special situation where the `DocViewerComponent` is displaying semi-static
   * content that cannot contain directives. So all the links in that content would not be
   * able to use such a `LinkDirective`. Instead we are adding a click handler to the
   * `AppComponent`, whose element contains all the of the application and so captures all
   * link clicks both inside and outside the `DocViewerComponent`.
   *
   * 브라우저가 페이지를 다시로드하지 않고 문서간에 이동하기 위해`LocationService`를
   * 사용하기 때문에 링크의 클릭을 차단해야합니다.
   * 링크가 렌더링 할 문서에 대한 것이면, 우리는`Location.go ()`를 사용하여 탐색하고
    * 브라우저에 이벤트를 처리하지 말 것을 지시합니다.
    *
    * 대부분의 응용 프로그램에서 앵커에 연결된 'LinkDirective'에서이 작업을 수행 할 수
    * 있지만이 응용 프로그램에서는`DocViewerComponent`가 반 정적으로 표시되는
    * 특별한 상황이 있습니다
    * 지시어를 포함 할 수없는 콘텐츠. 그래서 그 내용의 모든 링크는 그러한`LinkDirective`를
    * 사용할 수 없습니다. 대신 우리는 요소가 모든 애플리케이션을 포함하고있는
    * `AppComponent`에 클릭 핸들러를 추가함으로써`DocViewerComponent` 안팎의
    * 모든 링크 클릭을 캡처합니다.
   */

  handleAnchorClick(anchor: HTMLAnchorElement, button = 0, ctrlKey = false, metaKey = false) {

    // Check for modifier keys and non-left-button, which indicate the user wants to control navigation
    // 사용자가 탐색을 제어하려고 함을 나타내는 편집키(ctrl, shift, alt...)와 비 왼쪽 버튼이 있는지 확인하십시오.
    if (button !== 0 || ctrlKey || metaKey) {
      return true;
    }

    // 대상이 있고`_self '가 아닌 경우이 신호를 가로 채기를 원치 않는 신호로 사용합니다.
    // TODO: 우리가 명시 적으로`_self` 타겟을 옵트 아웃하도록 허용해야합니까?
    const anchorTarget = anchor.target;
    if (anchorTarget && anchorTarget !== '_self') {
      return true;
    }

    if (anchor.getAttribute('download') != null) {
      return true; // 다운로드가 이루어 지도록하십시오.
    }

    const { pathname, search, hash } = anchor;
    const relativeUrl = pathname + search + hash;
    this.urlParser.href = relativeUrl;

    // 외부 링크 또는 확장자가있는 경우 탐색하지 않음
    if ( anchor.href !== this.urlParser.href ||
         !/\/[^/.]*$/.test(pathname) ) {
      return true;
    }

    // 네비게이션 승인
    this.go(relativeUrl);
    return false;
  }
}
