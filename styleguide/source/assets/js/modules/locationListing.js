import sticky from "../helpers/sticky.js";
import getTemplate from "../helpers/getHandlebarTemplate.js";
import listing from "../helpers/listing.js";

export default function (window,document,$,undefined) {
  // Active state classes for location listing rows.
  let activeClass = 'is-active',
    markerActiveClass = 'is-marker-bounce',
    // Selectors for event listeners on dynamic content.
    locationListingRow = '.js-location-listing-link',
    activeLocationListingRow = locationListingRow + '.' + activeClass,
    markerActiveLocationListingRow = locationListingRow + '.' + markerActiveClass,
    // Parent component selectors.
    listingCol = '.js-location-listing-results',
    listingParent = '.js-image-promos',
    mapCol = '.js-location-listing-map';

  $('.js-location-listing').each(function(i){
    let $el = $(this),
      $mapCol = $el.find('.js-location-listing-map'),
      $map = $el.find('.js-google-map'),
      $resultsHeading = $el.find('.js-results-heading'),
      $pagination = $el.find('.js-pagination'),
      $locationFilter = $el.find('.js-location-filters');

    sticky.init($mapCol);

    // Get the location listing component data (this could be replaced with an api)
    const rawData = ma.locationListing[i]; // Data object created in @organisms/by-author/location-listing.twig

    let masterData = []; // master data structure to preserve state
    // Listen for map initialization, populate master data structure using locationListing, map markers.
    $map.on('ma:GoogleMap:MapInitialized', function(e, markers) {
      masterData = populateMasterDataSource(rawData, markers); // to preserve state
    });

    // Listen for Google Map api library load completion, with geocode, geometry, and places libraries
    $(document).on('ma:LibrariesLoaded:GoogleMaps', function(){
      // Set up click handler for location listing rows.
      $el.on('click', locationListingRow, function (e) {
        let index = $(e.currentTarget).index();
        // trigger map to recenter on this item based on it's index.
        $map.trigger('ma:GoogleMap:MapRecenter', index);
        // mark this link as active
        $el.find(activeLocationListingRow).removeClass(activeClass);
        $(e.currentTarget).addClass(activeClass); // in case the event is triggered on a child element.
        // focus on the map - mainly for mobile when it is stacked
        let position = $map.offset().top;
        $("html,body").stop(true, true).animate({scrollTop: position}, '750');
      });

      // Set up hover / focus event for listing rows.
      $el.on('mouseenter focusin', locationListingRow, function (e) {
        // remove active state from previously selected list item
        $el.find(activeLocationListingRow).removeClass(activeClass);

        // Don't bounce the marker again if focus moves within the same listing.
        if ($(e.currentTarget).hasClass(markerActiveClass)) {
          return false;
        }

        // Remove "focus" class from any "focused" location listing row.
        // ("focus" vs focus because hover doesn't bring focus to element.)
        $el.find(markerActiveLocationListingRow).removeClass(markerActiveClass);

        // Focus moved into listing for first time, so flag with class, recenter + bounce marker.
        $(e.currentTarget).addClass(markerActiveClass);
        let index = $(e.currentTarget).index();

        // Trigger map to recenter on this item and make the marker bounce
        $map.trigger('ma:GoogleMap:MarkerBounce', index);
      });

      // Remove "focus" class from any "focused" location listing row.
      $el.on('mouseleave', locationListingRow, function (e) {
        $el.find(markerActiveLocationListingRow).removeClass(markerActiveClass);
      });

      // Handle location listings form interaction (triggered by locationFilters.js).
      $locationFilter.on('ma:LocationFilter:FormSubmitted', function (e, formValues) {
        let transformation = transformData(masterData, formValues);
        masterData = transformation.data; // preserve state
        // Trigger child components render with updated data
        updateChildComponents(transformation);
      });

      // Handle active filter/tag button interactions (triggered by resultsHeading.js).
      $resultsHeading.on('ma:ResultsHeading:ActiveTagClicked', function (e, clearedFilter) {
        let transformation = transformData(masterData, clearedFilter);
        masterData = transformation.data; // preserve state
        transformation.clearedFilter = clearedFilter;

        // Trigger child components render with updated data
        updateChildComponents(transformation);
      });

      // Handle pagination event (triggered by pagination.js), render targetPage.
      $pagination.on('ma:Pagination:Pagination', function (e, target) {
        let nextPage = target;

        // Get the current page, default to first page if not in global data object.
        let currentPage = masterData.pagination.currentPage ? masterData.pagination.currentPage : 1;
        if (target === "next") {
          nextPage = currentPage + 1;
        }
        if (target === "previous") {
          nextPage = currentPage - 1;
        }

        masterData.pagination = listing.transformPaginationData({data: masterData, targetPage: nextPage});
        masterData.resultsHeading = listing.transformResultsHeading({data: masterData, page: nextPage});
        renderListingPage({data: masterData, page: nextPage});

        let markers = getActiveMarkers({data: masterData, page: nextPage});
        // Trigger child components render with updated data
        updateChildComponents({data: masterData, markers: markers});
      });
    });

    // Trigger events to update child components with new data.
    function updateChildComponents(args) {
      $resultsHeading.trigger('ma:ResultsHeading:DataUpdated', [args.data.resultsHeading]);
      $map.trigger('ma:GoogleMap:MarkersUpdated', [{markers: args.markers, place: args.place}]);
      $pagination.trigger('ma:Pagination:DataUpdated', [args.data.pagination]);
      if (args.clearedFilter) {
        $locationFilter.trigger('ma:FormFilter:DataUpdated', [args.clearedFilter]);
      }
    }
  });

  /**
   * Data initialization.
   */

  /**
   * Returns a master data structure with page level / listing item level data and markup, to reflect component state.
   *
   * @param listing
   *   The locationListing data structure to use as a source
   * @param markers
   *   The array of map markers created by component google map (googleMaps.js module)
   * @returns {Array}
   *   An array with the following structure:
   *    [
   *      maxItems: the max number of items to show per listing "page" if provided, defaults to all
   *      totalPages: the number of pages of items that should render, given the current filters
   *      resultsHeading: the data structure necessary to render a resultsHeading component
   *      items: an array of listing items [
   *        isActive: whether or not the listing should be shown, given current filters state
   *        page: the page that the listing, if active, will appear on, given the current sort order
   *        promo: the data structure for the imagePromo component
   *        markup: the compiled imagePromo markup
   *        marker: the related map marker data structure for the listing item
   *      ]
   *      pagination: the data structure necessary to render a pagination component
   *    ]
   */
  function populateMasterDataSource(listing, markers) {
    // Populate master data structure
    let masterData = [];

    // Ensure locationListing.imagePromos.items is an array (the twig template json_encode()'s a php array)
    let promosArray = [];
    $.map(listing.imagePromos.items, function(val, index) { promosArray[index] = val; });
    listing.imagePromos.items = promosArray;

    // Ensure locationListing.pagination.pages is an array (the twig template json_encode()'s a php array)
    let pages = [];
    $.map(listing.pagination.pages, function(val, index) { pages[index] = val; });
    listing.pagination.pages = pages;

    // Get the current page from the initial data structure, default to 1 if none passed.
    let currentPage = 1;
    pages.forEach(function(page) {
      if (page.active) {
        currentPage = Number(page.text);
      }
    });

    // Get the listing imagePromos, generate markup for each
    let masterListing = listing.imagePromos.items,
      masterListingMarkup = transformLocationListingPromos(masterListing);

    // The max number of items per page, if designated in locationListing data structure, else all
    masterData.maxItems = listing.maxItems ? listing.maxItems : listing.imagePromos.items.length;
    // The initial results heading data structure
    masterData.resultsHeading = listing.resultsHeading;
    // The array of items and their respective page, in/active status, marker data, imagePromo data, and markup
    masterData.items = getMasterListingWithMarkupAndMarkers(masterListing, masterListingMarkup, markers, masterData.maxItems);
    // The initial pagination data structure + currentPage;
    masterData.pagination = listing.pagination;
    masterData.pagination.currentPage = currentPage;
    // The total number of pages, given the number of items and the maxItems variable
    masterData.totalPages = Math.ceil(masterData.items.length / masterData.maxItems);

    return masterData;
  }

  /**
   * Creates the master data structure items array
   *
   * @param listing
   *   The locationListing data structure
   * @param markup
   *   The generated array of item markup
   * @param markers
   *   The associated map markers for each item
   * @param max
   *   The maximum number of items per page
   * @returns {Array}
   *  An array of listing items with the following structure:
   *  [
   *      isActive: whether or not the listing should be shown, given current filters state
   *      page: the page that the listing, if active, will appear on, given the current sort order
   *      promo: the data structure for the imagePromo component
   *      markup: the compiled imagePromo markup
   *      marker: the related map marker data structure for the listing item
   *   ]
   */
  function getMasterListingWithMarkupAndMarkers(listing, markup, markers, max) {
    let items = [];
    markers.forEach(function (item, index) {
      items[index] = {
        isActive: true, // @todo consider checking for this in case of server side preprocessing of state
        page: Math.ceil((index+1) / max),
        marker: item,
        markup: markup[index],
        data: listing[index]
      };
    });
    return items;
  }

  /**
   * Creates an array with generated markup for location listing items, preserving original index.
   *
   * @param promos
   *  The locationListing.imagePromos array of items
   *
   * @returns {Array}
   *  An array of compiled markup
   */
  function transformLocationListingPromos(promos) {
    // Get template for location listing (organisms > imagePromo)
    let compiledTemplate = getTemplate('locationListingRow');
    let listingMarkup = [];
    promos.forEach(function (data, index) {
      let promoData = promoTransform(data);
      listingMarkup[index] = compiledTemplate(promoData);
    });
    return listingMarkup;
  }


  /**
   * Data transformation.
   */

  /**
   * The main data transformation wrapper, returns an instance of masterData which reflects the component state.
   *
   * @param data
   *  An instance of masterData to start from.
   * @param transformation
   *  An object representing the change in state (locationFilter form data, resultsHeading tag interaction, etc.)
   *
   * @returns {{data: *, markers: *}}
   *  An object with the current state masterData instance and an array of their related sorted markers to send to map.
   */
  function transformData(data, transformation) {
    // First filter the data based on component state, then sort alphabetically by default.
    let filteredData = filterListingData(data, transformation),
      sortedData = listing.sortDataAlphabetically(filteredData),
      place = '';

    // Sort data by location, if that filter is present.
    if (listing.hasFilter(filteredData.resultsHeading.tags, 'location')) {
      place = listing.getFilterValues(filteredData.resultsHeading.tags, 'location')[0]; // returns array
      // If place argument was selected from the locationFilter autocomplete (initiated on the zipcode text input).
      if (ma.autocomplete.getPlace()) {
        place = ma.autocomplete.getPlace();
        // Sort the markers and instance of locationListing masterData.
        sortedData = sortDataAroundPlace(place, filteredData);
      }
      // If place argument was populated from locationFilter (zipcode text input) but not from Place autocomplete.
      else {
        // Geocode the address, then sort the markers and instance of locationListing masterData.
        ma.geocoder = ma.geocoder ? ma.geocoder : new google.maps.Geocoder();
        // @todo limit geocode results to MA?
        sortedData = listing.geocodeAddressString(place, sortDataAroundPlace, filteredData);
      }
    }

    // Update the results heading based on the current items state.
    sortedData.resultsHeading = listing.transformResultsHeading({data: sortedData});
    // Update pagination data structure, reset to first page
    sortedData.pagination = listing.transformPaginationData({data: sortedData}); // @todo this should probably go last so we know page #s
    // Render the listing page.
    renderListingPage({data: sortedData});

    // Get the associated markers based on the listing items.
    let markers = getActiveMarkers({data: sortedData});

    // Preserve state of current data.
    return {
      data: sortedData,
      markers: markers,
      place: place
    };
  }

  /**
   * Filters the listing data based on component filter state.
   *
   * @param data
   *  An instance of masterData to start from.
   * @param filterData
   *  Data structure representing either the newly applied or cleared filters.
   * @returns {*}
   */
  function filterListingData(data, filterData) {
    // Get the currently active filters.
    let filters = listing.transformActiveTagsData({data: data, filterData: filterData});
    // Update the results heading tags with the new active filters.
    data.resultsHeading.tags = filters;

    // If tag (checkbox) filter is present, filter based on current tag values.
    if (listing.hasFilter(filters, 'tag')) {
      // Get just the tag values from the filters array.
      let tags = listing.getFilterValues(filters, 'tag');
      // Identify active data based on filter.
      return listing.filterDataByTags(tags, data);
    }

    // Either there are no filters or the only active filter is location, make all items active
    return listing.makeAllActive(data);
  }

  /**
   * Returns the markers which correspond to a given "page" of location listing data.
   *
   * @param args
   *  An object with the following structure:
   *    {
   *      data: instance of filtered, sorted masterData off of which to base markers
   *      page: the target page of items/markers to render
   *    }
   *
   * @returns
   *   An array of corresponding map marker objects which should be rendered
   */
  function getActiveMarkers(args) {
    let data = args.data,
      page = args.page ? args.page : 1; // default to first page if non provided

    // Get just the markers from our active sorted/filtered data listing.
    return data.items.filter(function(item) {
      return item.isActive && item.page === page;
    }).map(function(item) {
      return item.marker;
    });
  }

  /**
   * Returns transformed imagePromo data object.
   *
   * @param promo
   *   The imagePromo.item[]{} being transformed.
   *
   * @returns {*}
   *   The original imagePromo object with a formatted tag property.
   */
  function promoTransform(promo) {
    // Ensure tags are an array.
    let tags = [];
    $.map(promo.tags, function(val, index) { tags[index] = val; });
    promo.tags = tags;

    let tagsData = {
      tagsFormatted: promo.tags.map(transformTag)
    };
    return Object.assign({},promo,tagsData);
  }

  /**
   * Returns a formatted imagePromo.tag object with a label and svg icon markup.
   *
   * @param tag
   *   The tag being transformed.
   *
   * @returns {{label, svg: boolean}}
   */
  function transformTag(tag) {
    return {
      label: tag.label,
      svg: getSvgFromTag(tag.id)
    };
  }

  /**
   * Returns the svg element markup from the corresponding tag filter checkbox label icon
   *
   * @param tag
   *  The imagePromo tag.id whose icon we need
   *
   * @return string
   *  The svg element for the matching filter form tag input.
   */
  function getSvgFromTag(tag) {
    // Get the existing corresponding icon markup so we don't have to worry about outdated markup.
    return $('.js-filter-by-tags').find("#" + tag).parent().siblings('svg').prop('outerHTML');
  }

  /**
   * Returns instance of location listing masterData, sorted proximity to place.
   *
   * @param place
   *   The geocode information by which to sort.
   * @param data
   *   The instance of location listing masterData.
   * @returns {*}
   *   Sorted instance of location listing masterData.
   */
  function sortDataAroundPlace(place, data) {
    // Get all existing marker distance from place, assign as marker property.
    for (let key in data.items) {
      if (data.items.hasOwnProperty(key)) {
        data.items[key].marker.distance = google.maps.geometry.spherical.computeDistanceBetween(place.geometry.location, data.items[key].marker.getPosition());
      }
    }

    // Sort existing markers by closest to the place.
    data.items.sort(function (a, b) {
      return a.marker.distance - b.marker.distance;
    });

    // Update each location listing item's page number based on new marker sort order.
    let paginated = listing.paginateItems(data.items, data.maxItems);
    data.items = paginated.items;
    data.totalPages = paginated.totalPages;

    // Return the newly sorted instance of location listing masterData.
    return data;
  }

  /**
   * Renders the new page of location listing image promos and broadcasts the rendered master data instance.
   *
   * @param args
   *   Arguments object with the following structure:
   *   {
   *      page: (optional) the page to be rendered, defaults to 1
   *      data: the instance of master data to render
   *   }
   */
  function renderListingPage(args) {
    listing.clearListingPage(listingCol,listingParent);
    let $el = $(listingCol).find(listingParent),
      page = args.page ? args.page : 1;

    args.data.items.forEach(function(item){
      if (item.isActive && item.page === page) {
        $el.append(item.markup);
      }
    });

    // Focus on the first focusable element in the first listing
    let $firstListing = $el.find(locationListingRow).first();
    // :focusable is possible with helpers/jQueryExtend.js
    $firstListing.find(':focusable').eq(0).focus();

    sticky.init($(mapCol));
  }

}(window,document,jQuery);
