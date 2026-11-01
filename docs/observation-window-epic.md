# Observation Window — epic

Oct 31, 2026 · @Tony

## Epic

**Observation Window: a scrubbable, case-driven view of a user's world that feeds Orient without deciding for them.**

The Observation Window is the Observe step of OODADSS. Systems Thinking Tarot covers Orient. The Window keeps a timestamped record of what a user's sources saw and lays it on a timeline the user scrubs like a video editor. It shows the full picture to the user, who does the synthesis. The model is the Batcomputer: it gathers every feed, correlates them, and hands the complete data to the one person who decides.

Guiding rules:

- **It never decides.** It proposes and shows reasons, and the user can override everything it suggests.
- **It earns trust without disclosure.** It works from toggles, tags, and open cases, never from confessions.
- **It breaks the bubble on purpose.** It sends outside-interest sources and opposing hypotheses without being asked.
- **It stores history.** Rewind, correlation, and baselines all depend on a timestamped record.

Success measure: a shorter decision cycle, from opening a case to handing it off to Orient.

Decision (2026-10-31): the Window is being built now. Fall pitch feedback will steer priorities between releases, not whether to build.

## Features

The epic breaks into nine features. F1 to F3, running on the F9 enabler, make up the smallest usable release.

| # | Feature | What it gives the user | Behaviors covered | Slice |
| --- | --- | --- | --- | --- |
| F1 | Timeline scrubber and live pin | Drag through stored history and snap back to now | Keeps history, rewind | MVP |
| F2 | Source lanes and outside-interest injection | One lane per source or entity, user-tuned, plus lanes they didn't pick | Aggregates, tuned by user, breaks the bubble | MVP |
| F3 | Timing correlation window | Stories close in time pop together | Correlates by timing | MVP |
| F4 | Open cases and hypotheses | A decision sets what counts, with proposed and editable evidence tags | Observes in the user's interests, never decides | Release 2 |
| F5 | Stakes, baselines, and absences | Quiet but important items stand out; off-normal volume and missing events show | Faint signals, consequence over volume | Release 2 |
| F6 | Entities, signatures, source trust, and map | Follow a person or place across lanes; see patterns, provenance, and where | Correlates by known models, Batcomputer | Release 3 |
| F7 | Field notes and others' journals | First-hand observations next to public feeds | Others' journals as sources, no user journal system | Release 3 |
| F8 | Handoff to Orient and cycle measurement | Send a moment to a tarot draw; measure decision time | Hands off to Orient, measurable cycle | Release 2 |
| F9 | Collection, storage, and cost limits (enabler) | Sources watched on a schedule, stored once, within a separate background budget | Keeps history; enables F1 to F8 | MVP |

## F1 — Timeline scrubber and live pin

The user drags a single control through the stored history, and whatever sits under the thumb pops into the center of the page.

**S1.1 — Store observed items with timestamps.** The store itself is built in S9.3 under F9. F1 reads from it.

**S1.2 — Scrub the timeline.** As a user, I want to drag a slider across my history and see the items at that moment, so I can ask what was happening then.

**S1.3 — Live pin.** As a user, I want one control that snaps the scrubber back to now, so I can rewind freely without losing my place.

**S1.4 — Playback.** As a user, I want to play the timeline forward at a steady speed, so I can watch a period unfold without dragging. Playback runs at one fixed speed, the whole stored month in about a minute. A speed control can come later. (Groomed 2026-10-31.)

**S1.5 — Jump from a marker.** As a user, I want to click a marker on the timeline and land on it, so I can move straight to something I spotted. A card's title is a separate thing: it opens the article. (Groomed 2026-10-31.)

**S1.6 — Search.** As a user, I want to search for a keyword across the titles and text of my stored items, with everything that doesn't match dimmed and left out of the cards, so I can find a topic across all my lanes at once. Every word typed must match, case is ignored, and "Whole word" is an option that is off by default (it cut "ai" from 352 matches to 109). Previous and next buttons, plus Enter and Shift+Enter in the search box, jump between matches. What "text" covers is an open question. (Groomed 2026-10-31.)

**S1.7 — Widen a thin search.** As a user, when my search finds fewer than 3 exact matches in the current window, I want it to widen step by step, so I still see related items without having to guess better words. The steps are: word forms (tariffs, tariff), then synonyms (tariff, duty), then broader terms (tariff, tax); later, meaning-based matching. It stops as soon as the window has 3 matches. Rules from the prototype: the system shows what it added as removable chips, marks related items as "related, not exact" with the reason, and never widens when there are already 3 exact matches. The threshold is fixed at 3. (Groomed 2026-10-31; how good the widened results are is an open question.)

**S1.8 — Axis starts at the first item.** As a user, I want the time axis and the slider to start at the first stored item and line up exactly with the dots, so the slider's position always matches what I'm looking at. (Groomed 2026-10-31.)

```gherkin
Feature: Timeline scrubber and live pin

  Scenario: Item under the thumb pops into view
    Given my Window holds an item published at 2026-03-18 11:30
    When I drag the scrubber to 2026-03-18
    Then that item's full card appears in the center of the page
    And its marker on the timeline is highlighted

  Scenario: Rewind to an exact moment
    Given my Window has stored items for the last 7 days
    When I set the scrubber to two hours ago
    Then I see the items whose timestamps fall within the correlation window around that time

  Scenario: Snap back to live
    Given the scrubber is set to a date in the past
    When I choose "Go live"
    Then the scrubber moves to the current time
    And the readout shows "Live"

  Scenario: Empty stretch
    Given no items fall within the window at the scrubber's position
    Then I see "Nothing in this window" with a prompt to widen the window or keep scrubbing

  Scenario: Item kept after the source drops it
    Given a source removed an article from its feed after I ingested it
    When I scrub to that article's time
    Then the stored copy still appears

  Scenario: Play forward from here
    Given the scrubber is at Oct 10
    When I choose "Play"
    Then the scrubber moves forward at a steady pace
    And the cards update as it moves
    And the button reads "Pause"

  Scenario: Pause
    Given playback is running
    When I choose "Pause"
    Then the scrubber stays where it is

  Scenario: Playback reaches now
    Given playback is running
    When the scrubber reaches the current time
    Then playback stops
    And the readout shows "Live"
    And the button reads "Play"

  Scenario: Play from Live restarts
    Given the scrubber is at Live
    When I choose "Play"
    Then the scrubber returns to the start of the stored history and plays forward

  Scenario: Taking control stops playback
    Given playback is running
    When I drag the scrubber, choose "Go live", or jump to an item
    Then playback stops

  Scenario: Click a marker to jump to it
    Given an item is published at 11:30 on Mar 18
    When I click its marker on the timeline
    Then the scrubber moves to 11:30 on Mar 18
    And the item appears in that window's cards or in its "more" list

  Scenario: Dimmed markers can't be clicked
    Given solo or search has dimmed a marker
    When I click it
    Then nothing happens

  Scenario: A card's title opens the article
    Given a card is showing
    When I click its title
    Then the article opens in a new tab
    And the scrubber does not move

  Scenario: Axis starts at the first item
    Given the oldest stored item was published at 8:00 PM on Oct 1
    Then the axis and the slider start at 8:00 PM on Oct 1
    And with the slider at its left end, the needle sits on that item's marker

  Scenario: Slider and needle agree along the whole width
    When I move the slider to any position
    Then the needle is at the same position on the timeline, within a pixel

  Scenario: Axis follows the history
    Given items older than 30 days are removed
    Then the axis starts at the oldest item that remains

  Scenario: All words must match
    Given one item reads "China tariffs hit exporters" and another reads "China opens a new port"
    When I search "china tariffs"
    Then only the first item stays lit
    And the second dims and leaves the cards

  Scenario: Case is ignored
    When I search "CHINA"
    Then items containing "china" match

  Scenario: Search dims everything that doesn't match
    When I search for a word
    Then markers that don't match dim
    And rows with no matches dim
    And the cards show only matching items
    And the count reads "N matches in all"

  Scenario: Whole word
    Given an item contains "said"
    When I search "ai" with "Whole word" off
    Then that item matches
    When I turn "Whole word" on
    Then that item does not match

  Scenario: Jump to the next match
    Given matches exist before and after the scrubber
    When I choose "next match"
    Then the scrubber moves to the nearest later matching item
    And when no later match exists, "next match" is unavailable

  Scenario: Search keyboard
    Given the cursor is in the search box
    When I press Enter
    Then the scrubber jumps to the next match
    When I press Shift+Enter
    Then it jumps to the previous match
    When I press Esc
    Then the search clears
    And a second Esc clears any solo

  Scenario: Search within a solo
    Given I have soloed "war"
    When I search "china"
    Then only matching items in "war" stay lit
    And the count reads "N matches in all, M in the soloed rows"

  Scenario: Nothing matches in the soloed rows
    Given matches exist only outside the soloed rows
    Then the cards area says nothing in the soloed rows matches
    And it says how many matches are in other rows
    And previous and next are unavailable

  Scenario: Nothing matches anywhere
    When I search for a word no stored item contains
    Then I see that no stored item contains it, and a suggestion to try another word
    And with "Whole word" on, a suggestion to turn it off

  Scenario: Only the title and summary are searched
    Given a word appears only in an article's full text, beyond its stored summary
    When I search that word
    Then the item does not match

  Scenario: Widen when fewer than 3 exact matches
    Given the current window has 1 exact match for "tariffs"
    Then the search widens step by step, to word forms, then synonyms, then broader terms
    And it stops as soon as the window has 3 matches, or the steps run out
    And a line says the search widened, and lists the added terms

  Scenario: No widening when there are enough
    Given the current window has 3 exact matches
    Then nothing is widened
    And no widening line appears

  Scenario: Exact matches rank first
    Given the window has 2 exact matches and 5 related items
    When the search is widened
    Then the 2 exact matches appear in the cards before any related item
    And the related items follow in source order

  Scenario: Related items say why
    Given an item matched only because "duty" is a synonym of "tariff"
    Then its card reads "Related, not exact" with “duty” (synonym of “tariff”)
    And its marker has a ring

  Scenario: Only terms found in the stored news are added
    Given a suggested term appears in no stored item
    Then it is not added

  Scenario: Terms that match too much are dropped
    Given a suggested term appears in more than 8% of stored items
    Then it is not added

  Scenario: Remove a term
    Given the widening line shows the term "closing"
    When I remove it
    Then items that matched only because of "closing" dim
    And a "Restore removed terms" control appears

  Scenario: Widening follows the scrubber
    Given the search is widened at one position
    When I scrub to a window with 3 exact matches
    Then the widening line disappears
    And only exact matches stay lit
```

## F2 — Source lanes and outside-interest injection

Each source or topic gets its own lane on a shared time axis, and some lanes come from outside the user's interests on purpose.

**S2.1 — Add and toggle sources.** As a user, I want to add an RSS or Atom feed by pasting its address, choose which group it belongs to, and switch any source on or off, so the Window takes the shape of my world. Adding paid search topics is a separate story and isn't groomed here. (Groomed 2026-10-31.)

**S2.2 — Lanes on one axis.** As a user, I want each source or topic in its own lane under one time axis, so I can compare beats at the same moment.

**S2.3 — Outside-interest injection.** As a user, I want an occasional lane or item from outside my chosen interests, so my Window doesn't become a closed news bubble. Injection runs about once a day, drawing from a curated pool the operator maintains. (Decided 2026-10-31.)

**S2.4 — Mark an injected item.** As a user, I want injected items clearly labeled, so I know the system chose them and why.

**S2.5 — Dense lanes stay readable.** As a user, I want only important items titled and the rest shown as markers, so a busy lane doesn't become unreadable.

**S2.6 — Group sources by subject.** As a user, I want sources grouped under subject rows (such as "war" or "telecom") that show all their dots together and that I can collapse or expand, so I can see the overall shape at a glance or open a group for the detail. (Groomed 2026-10-31.)

**S2.7 — Solo a group or source.** As a user, I want to solo a group or a single source so that everything else dims and drops out of the cards, so I can look at one subject at a time. (Groomed 2026-10-31.)

**S2.8 — Reorder sources and groups.** As a user, I want to drag a source or a whole group up or down, so I control which items rank first in the cards. Source order is the ranking until stakes arrive in Release 2. (Groomed 2026-10-31.)

**S2.9 — Remove a source.** As a user, I want to remove a source I no longer want, keeping what it already collected until that expires, so I don't lose history I was still looking at. The kept items are marked with a trash can to show that deletion is pending. (Groomed 2026-10-31; see the open question for the assumptions.)

```gherkin
Feature: Source lanes and outside-interest injection

  Scenario: Toggle a source off
    Given I have lanes for Strawberries, Dairy Queen, and Fertilizer
    When I switch off Dairy Queen
    Then its lane disappears from the timeline
    And its stored items are kept for when I switch it back on

  Scenario: Injection arrives
    Given the injection rate is about one item per day
    When a day passes
    Then at least one item from a source I did not choose appears in an injected lane
    And it is labeled "Outside your interests" with a one-line reason

  Scenario: User dismisses an injected source
    Given an injected lane is visible
    When I dismiss it
    Then that source stops appearing
    And future injections still come from other sources

  Scenario: Busy lane
    Given a lane holds more than 20 items in the visible range
    Then only the 5 highest-ranked items show titles (rank is source order until F5 adds stakes, then stakes of 2 or more)
    And the others show as unlabeled markers with the title on hover

  Scenario: Group row shows its sources together
    Given the "war" group holds four sources
    Then the "war" row shows all four sources' dots together
    And it shows how many of its items fall in the current window

  Scenario: Collapse a group
    When I click the "war" row
    Then its four source rows hide and the "war" row stays
    When I click it again
    Then the source rows return

  Scenario: Collapse all and expand all
    When I choose "Collapse all"
    Then only the group rows remain
    And the control reads "Expand all"

  Scenario: Collapsed groups are remembered
    Given I collapsed some groups
    When I reload the page
    Then they are still collapsed

  Scenario: Solo a group
    When I solo "war"
    Then dots outside "war" dim
    And rows outside "war" dim
    And the cards show only "war" items
    And a line says how many other items are hidden

  Scenario: Solo a single source
    When I solo one source inside "war"
    Then only that source stays lit

  Scenario: Solos add up
    Given "war" is soloed
    When I also solo "BBC Business"
    Then both stay lit

  Scenario: Clear solo
    Given a solo is active
    Then a "Clear solo" button is visible
    When I click the lit solo button again, press Esc, or choose "Clear solo"
    Then everything is lit again

  Scenario: Soloing doesn't collapse the group
    When I click a solo button on a group row
    Then the group does not open or close

  Scenario: Add a feed by its address
    When I paste a feed address and choose the group "telecom"
    Then the Window checks that it is a working feed
    And shows the latest titles for me to confirm
    When I confirm
    Then the source appears as a row under "telecom", last in that group
    And the feed's current items are stored with their own dates

  Scenario: Not a feed
    When I paste an address that is not an RSS or Atom feed
    Then I am told it is not a feed and nothing is added

  Scenario: Feed can't be reached
    When I paste an address that doesn't respond
    Then I am told it couldn't be reached and nothing is added

  Scenario: Already added
    Given a source with that address is already in my Window
    When I paste it again
    Then I am told it is already there and shown where

  Scenario: New group
    When I add a feed and type a new group name "energy"
    Then a new group "energy" is created holding that source

  Scenario: Feed without dates
    Given a feed gives no publish dates
    When I add it
    Then its items are dated by when they were fetched
    And they are marked as having estimated dates

  Scenario: Reorder a source
    When I drag "Fierce Network" above "Light Reading"
    Then it ranks above it in the cards
    And the order is kept the next time I open the Window

  Scenario: Reorder a group
    When I drag the group "war" above "global economy"
    Then all of its sources rank above that group's sources in the cards

  Scenario: Remove a source
    Given "Defense News" has 10 stored items
    When I remove it
    Then the source stops being collected
    And its 10 items stay scrubbable, each marked with a trash can
    And the marking shows the date they will be deleted

  Scenario: Removed items expire with everything else
    Given a removed source's items are 30 days old
    Then they are deleted
    And its row disappears once none remain

  Scenario: No new items from a removed source
    Given I removed a source
    Then it is no longer collected
    And nothing newer than the removal appears from it
```

## F3 — Timing correlation window

Items from different lanes that fall within a set time window pop up together, sorted by stakes. Timing only finds candidates; F4 to F6 decide whether a co-occurrence means anything.

Until F5 ships there are no stakes, so ranking uses source order: items from sources higher in the user's source list rank first, with newest first as the tie-break. Where a story or scenario below says "stakes", read "rank" for the MVP.

**S3.1 — Co-occurring items shown together.** As a user, I want every item within the window shown side by side, so I see what happened around the same time across beats.

**S3.2 — Adjustable window.** As a user, I want to set the window from hours to a month, so the same view works for a two-hour rewind and for seasonal waves.

**S3.3 — Overflow.** As a user, I want the top items shown and the rest counted, so a crowded moment doesn't bury the page.

**S3.4 — Coincidence is not a link.** As a user, I want co-occurrence shown without implying a connection, so I don't read meaning into chance.

```gherkin
Feature: Timing correlation window

  Scenario: Items from two lanes pop together
    Given the window is set to plus or minus 4 days
    And a Strawberries item is dated 2026-03-18
    And a Dairy Queen item is dated 2026-03-20
    When I scrub to 2026-03-19
    Then both cards appear side by side

  Scenario: Narrow the window
    Given the same two items
    When I set the window to plus or minus 1 day and scrub to 2026-03-19
    Then at most one of them appears

  Scenario: Crowded moment
    Given 7 items fall within the window
    Then the 3 highest-ranked appear as cards (source order until F5 adds stakes)
    And a note reads "+4 more in this window at lower rank"

  Scenario: No implied link
    Given two items co-occur but share no entity, signature, or case
    Then they appear together without any connecting label or score
```

## F4 — Open cases and hypotheses

The user opens a case, which is a decision they're weighing, and writes the hypothesis themselves. The system proposes how each item bears on it, shows its reasons, and accepts every correction.

**S4.1 — Open a case.** As a user, I want to name a decision I'm weighing, so the Window knows what counts as relevant.

**S4.2 — Write my own hypothesis.** As a user, I want to state my hunch in my own words, so the system tests my thinking rather than inventing it.

**S4.3 — Proposed stance with a reason.** As a user, I want each relevant item tagged "supports" or "cuts against" with a one-line reason, so I can see why the tag was applied. Proposals come from simple rules: words from my case and hypothesis are matched against the item, and the matched words are the reason. (Decided 2026-10-31.)

**S4.4 — Override a tag.** As a user, I want to flip or clear any tag, so my judgment wins over the machine's.

**S4.5 — Evidence tally over time.** As a user, I want a running count of evidence up to the scrubber's position, so I can see how the case built up.

**S4.6 — Opposing hypothesis.** As a user, I want the system to offer a rival explanation that fits the same items, so I don't see only what confirms my hunch.

**S4.7 — Close a case.** As a user, I want to close a case when I've decided, so its tags and weighting stop shaping the view.

**S4.8 — Keep and delete my cases.** As a user, I want my cases, hypotheses, and field notes kept until I delete them, with a way to delete one or everything, so my own words last as long as I need them and no longer. This is separate from the 30-day rule, which covers news items only. (Decided 2026-10-31.)

```gherkin
Feature: Open cases and hypotheses

  Scenario: Hypothesis comes from the user
    When I open a case named "Plant a u-pick strawberry patch?"
    Then I am asked to write a hypothesis
    And no hypothesis is filled in for me

  Scenario: Proposed tag shows its reason
    Given my hypothesis is "Local demand for fresh berries is outrunning supply"
    When the item "Neighbor tore out his strawberry patch" is tagged
    Then it shows "Cuts against" with a one-line reason
    And the tag is marked as proposed

  Scenario: User flips a tag
    Given an item is tagged "Cuts against"
    When I change it to "Supports"
    Then the tag shows as set by me
    And the evidence tally updates

  Scenario: Lopsided tally prompts a rival
    Given 8 items support and 1 cuts against
    Then a rival hypothesis is offered that fits at least 3 of the same items
    And I can accept it as a second hypothesis or dismiss it

  Scenario: The system does not deliver a verdict
    Given any evidence tally
    Then the Window shows counts and items only
    And it never states that the hypothesis is true or false

  Scenario: Close a case
    Given I have an open case with tags and a hypothesis
    When I close it
    Then its tags and weighting stop shaping marker sizes, titles, and card order
    And the case stays in my list, marked closed

  Scenario: Closing asks nothing
    When I close a case
    Then I am not asked what I decided or why

  Scenario: Reopen a closed case
    Given a case is closed
    When I reopen it
    Then its hypothesis and the tags I set are back
    And they shape the view again

  Scenario: Close time is recorded
    When I close a case
    Then the time I closed it is stored for the cycle measurement

  Scenario: Cases outlast the news
    Given I opened a case 45 days ago
    Then the case, its hypothesis, and my tags are still there
    And the news items from that time have expired

  Scenario: Delete one case
    When I delete a case
    Then its hypothesis and tags are removed
    And the other cases are unaffected

  Scenario: Delete everything I wrote
    When I choose to delete all my cases and notes
    Then every case, hypothesis, tag, and field note of mine is removed
```

## F5 — Stakes, baselines, and absences

Items are weighted by what they could cost the open case, not by how loud they are. Each lane knows its normal volume, so unusual activity and missing expected events both show up.

**S5.1 — Stakes per case.** As a user, I want each item rated 0 to 3 for its stakes in my open case, so a quiet item that matters outranks a loud one that doesn't. Ratings come from simple rules, and I can change any of them. (Decided 2026-10-31.)

**S5.2 — Stakes drive visibility.** As a user, I want stakes to set marker size, title visibility, and card order, so my attention goes where the case needs it.

**S5.3 — Lane baseline.** As a user, I want each lane to show its normal monthly volume against the actual, so I can spot when a beat gets unusually busy.

**S5.4 — Expected events.** As a user, I want to register recurring events I expect, such as a monthly report, so their absence can be detected.

**S5.5 — Absence markers.** As a user, I want an expected event that didn't happen shown as a hollow marker and card, so I notice the dog that didn't bark.

```gherkin
Feature: Stakes, baselines, and absences

  Scenario: Quiet item outranks loud one
    Given my open case is "Plant a u-pick strawberry patch?"
    And a viral social post has stakes 0
    And a local note "Market berry stand sold out by 9am" has stakes 3
    When both fall in the same window
    Then the local note's card appears first
    And its marker is larger

  Scenario: Busier than normal
    Given the Fertilizer lane's June baseline is 0.5 items
    And it received 2 items in June
    Then June's bar in the baseline strip is drawn at full strength above the normal line

  Scenario: Missing expected event
    Given I expect a berry price report around the 15th of each month
    And none arrives by July 18
    Then a hollow marker appears at July 15 in the Strawberries lane
    And its card reads "Expected, didn't happen"

  Scenario: Switching cases reweights the view
    Given items are rated for two open cases
    When I switch from the strawberry case to the DQ franchise case
    Then marker sizes, visible titles, and card order change to that case's stakes
```

## F6 — Entities, signatures, source trust, and map

This is the Batcomputer layer. It tracks people, places, and organizations instead of keywords, recognizes known patterns, shows where each item came from and how far to trust it, and places items on a map.

**S6.1 — Entity resolution.** As a user, I want different names for the same thing resolved to one entity, so correlation works across sources that word it differently.

**S6.2 — Follow an entity.** As a user, I want to click an entity and see it outlined across every lane and on the map, so I can trace one thread through the whole picture.

**S6.3 — Pattern signatures.** As a user, I want items matched to named patterns from a library, such as price shock or early adoption, so correlation rests on known models rather than vague similarity. The first library reuses the patterns in the tarot's cards. (Decided 2026-10-31.)

**S6.4 — Source trust.** As a user, I want each item to show its source type and a trust level, so a wire report and a social post aren't treated as equal.

**S6.5 — Map panel.** As a user, I want items placed on a map that lights up for the current window, so I can see waves across space as well as time.

```gherkin
Feature: Entities, signatures, source trust, and map

  Scenario: Aliases resolve to one entity
    Given items mention "DQ", "the chain", and "Dairy Queen"
    Then all three are linked to the entity Dairy Queen
    And the resolution is visible on the entity chip

  Scenario: Follow an entity
    When I click the entity chip "Labor" on a card
    Then every item tagged Labor is outlined in every lane and on the map
    And a bar reads "Following Labor across every lane" with a stop control

  Scenario: Signature shown on the card
    Given an item matches the pattern "Price shock"
    Then its card shows "Pattern: Price shock"

  Scenario: Trust shown, not hidden
    Given an item comes from a social post
    Then its card shows "Social post · low trust"
    And it is not removed or down-ranked because of trust alone

  Scenario: Map follows the scrubber
    When I scrub to a window holding items from Florida and Ohio
    Then pins at those places grow and are labeled
    And all other pins stay small and unlabeled
```

## F7 — Field notes and others' journals

First-hand observations sit next to public feeds as a source. The Window accepts short notes and other people's published journals, but it is not a journal system for the user.

**S7.1 — Quick field note.** As a user, I want to log a short dated observation with a place and tags, so what I see on the ground counts alongside the news.

**S7.2 — Notes as a lane.** As a user, I want my notes in their own lane marked first-hand, so I can compare them against outside sources.

**S7.3 — Others' journals as sources.** As a user, I want to add other people's public journals or blogs as sources, so trusted first-hand accounts feed the Window.

**S7.4 — Not a diary.** As a user, I want notes kept short and observational, with no prompts about my feelings or problems, so the Window never asks me to confess.

```gherkin
Feature: Field notes and others' journals

  Scenario: Log a field note
    When I log "Market berry stand sold out by 9am" with place "Your town" and tag Strawberries
    Then it appears in the field-notes lane at the time I logged it
    And its card reads "Your note · first-hand"

  Scenario: A note joins a correlation
    Given my note and a Fertilizer item fall within the same window
    When I scrub there
    Then both cards appear together

  Scenario: Add someone else's journal
    When I add a public farm blog as a source
    Then its posts appear in a lane labeled with the author's name
    And they carry the source type "Journal" with a trust level I can set

  Scenario: No introspective prompts
    When I open the note form
    Then it asks only for the observation, time, place, and tags
    And it never asks how I feel or what I'm struggling with
```

## F8 — Handoff to Orient and cycle measurement

One gesture sends a moment from the Window into a Systems Thinking Tarot reading. The time between opening a case and handing it off is the decision-cycle measure.

**S8.1 — Orient on this moment.** As a user, I want to send the items in the current window to a tarot reading as its Current Events, so what I observed shapes my orientation.

**S8.2 — Case context travels.** As a user, I want my open case and hypothesis passed along as the reading's Context, so I don't retype them.

**S8.3 — Cycle time.** As a user, I want to see how long a case took from opening to handoff to closing, so I can tell whether my loops are getting shorter.

**S8.4 — Measurement without surveillance.** As a user, I want cycle data stored as timestamps only, with no content, so measuring me doesn't mean watching me.

**S8.5 — Task: let the Orientation Guide take supplied items.** As the operator, I want the Orientation Guide worker to accept pre-gathered Current Events and skip its own Tavily search when they are supplied, so the Window can feed a reading. The existing Tavily-only behavior stays available, so a reading started without Window items works exactly as it does today. This changes the existing worker ([orientation-guide handler](../amplify/functions/orientation-guide/handler.ts)), not only the new Window code.

```gherkin
Feature: Handoff to Orient and cycle measurement

  Scenario: Hand a moment to the tarot
    Given 3 items are in the current window
    And my open case has a hypothesis
    When I choose "Orient on this moment"
    Then a tarot reading starts with those 3 items as Current Events
    And my case and hypothesis prefilled as Context
    And the existing Daily Orientation Limit applies

  Scenario: Window replaces the per-reading search
    Given a reading was started from the Window
    Then no separate Tavily search runs for that reading

  Scenario: Tavily-only behavior still available
    Given a reading is started without Window items
    Then the worker runs its own Tavily search as it does today
    And the 20-second timeout and ungrounded fallback behave as they do today

  Scenario: Cycle time recorded
    Given I opened a case on Oct 1 and handed it off on Oct 9
    When I close it on Oct 12
    Then the case shows 8 days to orient and 11 days to decide

  Scenario: Only timestamps kept
    When cycle data is stored
    Then it holds the case id and event times only
```

## F9 — Collection, storage, and cost limits (enabler)

The Window has to keep watching while nobody is looking, which the tarot never had to do. This enabler adds three things: a scheduled collector, a timestamped store per user, and a background cost cap separate from the per-reading limits.

**S9.1 — Scheduled collector.** As a user, I want my sources fetched on a schedule even when I'm away, so history exists when I come back to rewind.

**S9.2 — Cadence per source.** As a user, I want each source to have its own fetch interval, such as hourly news and daily journals, so cost follows how fast a source changes.

**S9.3 — Timestamped, deduplicated store.** As a user, I want each item stored once with its source, published time, and fetched time, so the scrubber, baselines, and absences all read one reliable record.

**S9.4 — Fetch once, fan out.** As the operator, I want a source shared by many users fetched once and fanned out to each of them, so cost grows with the number of sources, not users.

**S9.5 — Background cost cap.** As the operator, I want a monthly ceiling on collection spending, separate from the per-reading budget, so ongoing work can't quietly consume the tarot's budget.

**S9.6 — Degrade before stopping.** As a user, I want collection to slow on low-stakes lanes before it stops anywhere, so a tight budget costs me detail, not whole beats.

**S9.7 — Coverage gaps shown honestly.** As a user, I want periods when the collector didn't run shown as gaps, so I never mistake a collector outage for a missing event.

**S9.8 — Retention and deletion.** As a user, I want news items kept for a month (30 days) and a way to delete my history sooner, so a long record of what I watched doesn't outlive its use. This is news, not personal items. Two separate deleters do the work: an expiry deleter that removes shared items past 30 days, and a user deleter that removes one user's links to items on request.

**S9.9 — Keep daily counts after items expire.** As a user, I want a daily count of items per source kept after the items themselves expire, with no titles, text, or links, so baselines and expected-event checks work beyond the 30-day item window. Counts are keyed by source, shared across users, and not tied to any user.

```gherkin
Feature: Collection, storage, and cost limits

  Scenario: History builds while I'm away
    Given I last opened the Window on Oct 20
    And my news sources are collected hourly
    When I open it on Oct 27
    Then items from Oct 20 to Oct 27 are stored and scrubbable

  Scenario: Shared source fetched once
    Given 40 users follow the same RSS feed
    When a collection cycle runs
    Then the feed is fetched once
    And each new item appears in all 40 users' Windows

  Scenario: Same story from two sources
    Given an article arrives from both RSS and a Tavily search
    Then it is stored as one item listing both sources

  Scenario: Approaching the collection cap
    Given collection spending reaches 80% of the monthly collection cap
    Then lanes with no stakes in any open case drop from hourly to daily
    And the per-reading tarot budget is unaffected

  Scenario: Cap reached
    Given collection spending reaches the monthly cap
    Then paid sources pause until the month resets
    And free RSS collection continues
    And I see a note that the Window is collecting less this month

  Scenario: Gap is not an absence
    Given the collector did not run from Sep 1 to Sep 3
    Then that period shows as a shaded gap on every affected lane
    And no "Expected, didn't happen" marker is raised inside it

  Scenario: Expiry deleter
    Given an item is older than 30 days
    Then the expiry deleter removes it from the shared store
    And it no longer appears in any user's Window

  Scenario: Count survives the item
    Given a source produced 3 items on Jun 4
    When the expiry deleter removes those items after 30 days
    Then the source still records "3 items on Jun 4"
    And no title, text, link, or user is kept with the count

  Scenario: Baseline uses the counts
    Given a source has daily counts for the last 6 months
    Then its lane's baseline strip compares this month's volume against its monthly average over those months

  Scenario: Topic lane has no long-term baseline
    Given a lane is a user's own topic search and not a single source
    Then its baseline strip covers only the last 30 days of stored items
    And the lane shows no longer-term comparison

  Scenario: User deleter
    When I delete my history
    Then my links to stored items are gone within 24 hours
    And items other users still follow remain until the expiry deleter removes them
```

## Slicing and open questions

Start with a self-test before any public build, then add a release only when the one before it earns its keep.

1. **Release 0, a self-test.** Store a few weeks of RSS and Tavily results with timestamps and scrub them in a throwaway scrubber (there is no prototype yet). It passes if a convergence shows you something you would have acted on.
2. **MVP (F1 to F3 and F9).** Scrubber, live pin, lanes with toggles and injection, and the correlation window, for one user, on a scheduled collector and store with a hard monthly collection cap.
3. **Release 2 (F4, F5, F8).** Cases, hypotheses with editable tags, stakes, baselines, absences, and the handoff to the tarot.
4. **Release 3 (F6, F7).** Entities, signatures, trust, map, field notes, and others' journals.

Decisions (2026-10-31):

- [x] A month of retention fits the correlation window (S3.2) but not baselines (F5) or expected monthly events (S5.4). After items expire, only a daily count of items per source is kept, and it holds nothing personal (S9.9).
- [x] Search covers the title and the stored summary only, not full article text (S1.6).
- [x] Widening stays on WordNet, with removable terms (S1.7). Revisit only if the broader-terms rung proves more annoying than useful.
- [x] When a search is widened, exact matches always rank above related ones (S1.7).
- [x] Removed sources: the kept items stay visible and searchable until they expire, the source's row stays greyed until its last item expires, the trash mark shows the deletion date, and re-adding the same address brings the items back (S2.9).
- [x] Outside-interest injection runs about once a day, from a curated pool the operator maintains (S2.3).
- [x] The scrubber's scale stays linear (S1.2).
- [x] A user's history is a shared store of items plus each user's links to them. A source is fetched once and fanned out, items expire after 30 days, and the user deleter removes only that user's links (S9.4, S9.8, S9.9). Where the store physically lives is chosen when we build.
- [x] Stakes and stance come from simple rules, and the user can override every one (S4.3, S5.1).
- [x] The first pattern signatures reuse the patterns in the tarot's cards (S6.3).
- [x] Cases, hypotheses, and field notes are kept until the user deletes them (S4.8). The 30-day rule covers news items only.
- [x] Release 2 comes after the MVP. Fall pitch feedback may reorder Releases 2 and 3 but does not decide whether to build.

Open questions:

- [ ] Paid-search cap (deferred on purpose): pick a monthly number after a month of real use. Build the cap mechanism regardless.
- [ ] Rule-based stakes (S5.1): which rules exactly? The starting idea is to match words from the user's case and hypothesis against each item, but how those words are chosen and weighted is for the start of Release 2.
- [ ] Signatures from the tarot (S6.3): how do the cards' patterns turn into signals that can be matched against news items? To groom at the start of Release 3.
- [ ] Case deletion (S4.8): when a user deletes a case, do its cycle timestamps (S8.4) stay for the measurement, or go too?

Groomed 2026-10-31: S1.4 to S1.8, S2.1, S2.6 to S2.9, and S4.7. The first group was groomed against how the prototype behaves, and the rest from decisions made while grooming. Nothing is left without scenarios.

Assumptions: sources are RSS plus Tavily at first. RSS is free, so fetch-once-and-fan-out matters mainly for Tavily, and only when users share a query. Reuters-style licensed feeds are out of scope on cost. All example names and data in the stories are invented. The prototype in prototype/observation-window uses real feeds.
