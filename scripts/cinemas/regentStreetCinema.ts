import fs from 'fs';
import { CinemaShowing, FilmShowing } from '../types';

export async function scraper(): Promise<CinemaShowing[]> {
    let body = {
        variables: {
            date: null,
            ids: [],
            movieId: null,
            movieIds: [],
            titleClassId: null,
            titleClassIds: [],
            siteIds: null,
            anyShowingBadgeIds: null,
            everyShowingBadgeIds: [null],
            resultVersion: null,
        },
        query: 'query ($date: String, $ids: [ID], $movieId: ID, $movieIds: [ID], $titleClassId: ID, $titleClassIds: [ID], $siteIds: [ID], $everyShowingBadgeIds: [ID], $anyShowingBadgeIds: [ID], $resultVersion: String) {\n  showingsForDate(\n    date: $date\n    ids: $ids\n    movieId: $movieId\n    movieIds: $movieIds\n    titleClassId: $titleClassId\n    titleClassIds: $titleClassIds\n    siteIds: $siteIds\n    everyShowingBadgeIds: $everyShowingBadgeIds\n    anyShowingBadgeIds: $anyShowingBadgeIds\n    resultVersion: $resultVersion\n  ) {\n    data {\n      id\n      time\n      showingId\n      isMarathon\n      hasMarathon\n      allowSalesInMarathon\n      overrideSeatChart\n      hasSeatChart\n      overridePriceCard\n      overridePostStartTimeBufferMinutes\n      customPostStartTimeBufferMinutes\n      published\n      ticketsSold\n      marathonTicketsSold\n      ticketsPaid\n      current\n      past\n      overrideReservedSeating\n      overrideReservedSeatingValue\n      customHeldSeatCount\n      overrideHeldSeatCount\n      customMarathonSeatCount\n      overrideMarathonSeatCount\n      overrideShowingBadges\n      allowWithoutMembership\n      disableTheaterSeatDelivery\n      qrItemOrderingOnly\n      allowConsumerRefunds\n      allowConsumerQrTabWithoutPaymentMethod\n      allowItemOrdersOnline\n      private\n      isPreview\n      displayMetaData\n      overrideMaxTicketsPerOrderPerShowing\n      maxTicketsPerOrderPerShowing\n      screenId\n      originalScreenId\n      priceCardId\n      customPriceCardId\n      movie {\n        id\n        name\n        showingStatus\n        displayMetaData\n        urlSlug\n        posterImage\n        signageDisplayPoster\n        bannerImage\n        signageDisplayBanner\n        animatedPosterVideo\n        signageDisplayAnimatedPoster\n        signageMessageOverride\n        color\n        synopsis\n        starring\n        directedBy\n        producedBy\n        searchTerms\n        duration\n        genre\n        allGenres\n        rating\n        ratingReason\n        trailerYoutubeId\n        trailerVideo\n        signageDisplayTrailer\n        releaseDate\n        dateOfFirstShowing\n        overrideDateOfFirstShowing\n        hideDateOfFirstShowing\n        embargoShowingLiftedAt\n        embargoPurchaseLiftedAt\n        allowPrivateSalesOnExternal\n        isMarathon\n        predictedWeekOneTicketSales\n        tmdbPopularityScore\n        tmdbId\n        includeInComingSoon\n        includeInFuture\n        overridePriceCard\n        overridePostStartTimeBufferMinutes\n        customPostStartTimeBufferMinutes\n        sendRentrak\n        rentrakName\n        libraryChildrenShowingCount\n        showingCount\n        allowPastSales\n        dcmEdiMovieId\n        dcmEdiMovieName\n        disableOnlineConcessions\n        overrideMaxTicketsPerOrderPerShowing\n        maxTicketsPerOrderPerShowing\n        displayOrder\n        displayOrderNext\n        siteId\n        titleClassId\n        customPriceCardId\n        __typename\n      }\n      showing {\n        id\n        time\n        showingId\n        isMarathon\n        hasMarathon\n        allowSalesInMarathon\n        overrideSeatChart\n        hasSeatChart\n        overridePriceCard\n        overridePostStartTimeBufferMinutes\n        customPostStartTimeBufferMinutes\n        published\n        ticketsSold\n        marathonTicketsSold\n        ticketsPaid\n        current\n        past\n        overrideReservedSeating\n        overrideReservedSeatingValue\n        customHeldSeatCount\n        overrideHeldSeatCount\n        customMarathonSeatCount\n        overrideMarathonSeatCount\n        overrideShowingBadges\n        allowWithoutMembership\n        disableTheaterSeatDelivery\n        qrItemOrderingOnly\n        allowConsumerRefunds\n        allowConsumerQrTabWithoutPaymentMethod\n        allowItemOrdersOnline\n        private\n        isPreview\n        displayMetaData\n        overrideMaxTicketsPerOrderPerShowing\n        maxTicketsPerOrderPerShowing\n        screenId\n        originalScreenId\n        priceCardId\n        customPriceCardId\n        movie {\n          id\n          name\n          showingStatus\n          displayMetaData\n          urlSlug\n          posterImage\n          signageDisplayPoster\n          bannerImage\n          signageDisplayBanner\n          animatedPosterVideo\n          signageDisplayAnimatedPoster\n          signageMessageOverride\n          color\n          synopsis\n          starring\n          directedBy\n          producedBy\n          searchTerms\n          duration\n          genre\n          allGenres\n          rating\n          ratingReason\n          trailerYoutubeId\n          trailerVideo\n          signageDisplayTrailer\n          releaseDate\n          dateOfFirstShowing\n          overrideDateOfFirstShowing\n          hideDateOfFirstShowing\n          embargoShowingLiftedAt\n          embargoPurchaseLiftedAt\n          allowPrivateSalesOnExternal\n          isMarathon\n          predictedWeekOneTicketSales\n          tmdbPopularityScore\n          tmdbId\n          includeInComingSoon\n          includeInFuture\n          overridePriceCard\n          overridePostStartTimeBufferMinutes\n          customPostStartTimeBufferMinutes\n          sendRentrak\n          rentrakName\n          libraryChildrenShowingCount\n          showingCount\n          allowPastSales\n          dcmEdiMovieId\n          dcmEdiMovieName\n          disableOnlineConcessions\n          overrideMaxTicketsPerOrderPerShowing\n          maxTicketsPerOrderPerShowing\n          displayOrder\n          displayOrderNext\n          siteId\n          titleClassId\n          customPriceCardId\n          __typename\n        }\n        seatsRemaining\n        seatsRemainingWithoutSocialDistancing\n        __typename\n      }\n      showings {\n        id\n        time\n        showingId\n        isMarathon\n        hasMarathon\n        allowSalesInMarathon\n        overrideSeatChart\n        hasSeatChart\n        overridePriceCard\n        overridePostStartTimeBufferMinutes\n        customPostStartTimeBufferMinutes\n        published\n        ticketsSold\n        marathonTicketsSold\n        ticketsPaid\n        current\n        past\n        overrideReservedSeating\n        overrideReservedSeatingValue\n        customHeldSeatCount\n        overrideHeldSeatCount\n        customMarathonSeatCount\n        overrideMarathonSeatCount\n        overrideShowingBadges\n        allowWithoutMembership\n        disableTheaterSeatDelivery\n        qrItemOrderingOnly\n        allowConsumerRefunds\n        allowConsumerQrTabWithoutPaymentMethod\n        allowItemOrdersOnline\n        private\n        isPreview\n        displayMetaData\n        overrideMaxTicketsPerOrderPerShowing\n        maxTicketsPerOrderPerShowing\n        screenId\n        originalScreenId\n        priceCardId\n        customPriceCardId\n        movie {\n          id\n          name\n          showingStatus\n          displayMetaData\n          urlSlug\n          posterImage\n          signageDisplayPoster\n          bannerImage\n          signageDisplayBanner\n          animatedPosterVideo\n          signageDisplayAnimatedPoster\n          signageMessageOverride\n          color\n          synopsis\n          starring\n          directedBy\n          producedBy\n          searchTerms\n          duration\n          genre\n          allGenres\n          rating\n          ratingReason\n          trailerYoutubeId\n          trailerVideo\n          signageDisplayTrailer\n          releaseDate\n          dateOfFirstShowing\n          overrideDateOfFirstShowing\n          hideDateOfFirstShowing\n          embargoShowingLiftedAt\n          embargoPurchaseLiftedAt\n          allowPrivateSalesOnExternal\n          isMarathon\n          predictedWeekOneTicketSales\n          tmdbPopularityScore\n          tmdbId\n          includeInComingSoon\n          includeInFuture\n          overridePriceCard\n          overridePostStartTimeBufferMinutes\n          customPostStartTimeBufferMinutes\n          sendRentrak\n          rentrakName\n          libraryChildrenShowingCount\n          showingCount\n          allowPastSales\n          dcmEdiMovieId\n          dcmEdiMovieName\n          disableOnlineConcessions\n          overrideMaxTicketsPerOrderPerShowing\n          maxTicketsPerOrderPerShowing\n          displayOrder\n          displayOrderNext\n          siteId\n          titleClassId\n          customPriceCardId\n          __typename\n        }\n        seatsRemaining\n        seatsRemainingWithoutSocialDistancing\n        __typename\n      }\n      showingBadgeIds\n      predictedAttendance\n      seatsRemaining\n      seatsRemainingWithoutSocialDistancing\n      __typename\n    }\n    count\n    resultVersion\n    __typename\n  }\n}',
    };

    let headers = {
        Host: 'www.regentstreetcinema.com',
        'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Referer: 'https://www.regentstreetcinema.com/now-playing/',
        'content-type': 'application/json',
        'is-electron-mode': 'false',
        'site-id': '85',
        'circuit-id': '19',
        'client-type': 'consumer',
        'Content-Length': '9082',
        Origin: 'https://www.regentstreetcinema.com',
        'Sec-GPC': '1',
    };

    let response = await fetch('https://www.regentstreetcinema.com/graphql', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: headers,
    });

    // 👇️ const result: CreateUserResponse
    const result = await response.json();

    let movie_data: object = result['data']['showingsForDate']['data'];

    let movie_info_out: Array<FilmShowing> = [];

    for (let [_key, movie] of Object.entries(movie_data)) {
        let movie_info: FilmShowing = {
            name: movie['movie']['name'],
            localId: movie['movie']['tmdbId'], // NOTE: should decide if use it to make optimizations
            startTime: movie['time'],
            duration: movie['movie']['duration'],
            url:
                'https://www.regentstreetcinema.com/checkout/showing/' +
                movie['id'],
        };
        movie_info_out.push(movie_info);
    }
    return [
        {
            cinema: 'RegentStreetCinema',
            location: 'London',
            showings: movie_info_out,
        },
    ];
}
