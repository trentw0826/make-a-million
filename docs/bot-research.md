# Strong Bots – Research Review

What the literature says about improving bots like Hard and Expert beyond PIMC and simple calibration, and which methods fit this game and its constraints (`bot-standards.md`: deterministic, no state between decisions, observation-only; about 4.5 s on one thread for Expert; pure-TypeScript inference). Written for the Expert work in November 2026 from five literature searches; every claim carries its source, and the sources list marks what could not be confirmed. How the bots work is in `bot-design.md`, measured results in `bot-ladder.md`, the plan in `bot-roadmap.md`.

## Summary: learned bid values and beliefs beat deeper search

In hidden-hand trick-taking games with bidding, the methods that have measurably beaten PIMC-plus-calibration bots give PIMC better inputs. None of them replaces PIMC as the search. In Skat, policy-based inference weights each sampled world by a learned model of every other player's past actions. It beat learned card-location inference by 1.6–2.3 tournament points per game (TP/G) in suit and null games, and beat no inference by 6–10 ([Rebstock et al. 2019](https://arxiv.org/abs/1905.10911)). Learned contract evaluators that may choose only well-supported actions beat Kermit's bidding by 1.17 TP/G ([Rebstock et al. 2019b](https://arxiv.org/abs/1905.10907)). Bridge bidders that roll the auction forward with their own policy on shared sampled deals reached +0.85 IMPs/deal over WBridge5 ([Lockhart et al. 2020](https://arxiv.org/abs/2011.14124)). Search that removes PIMC's strategy fusion helps, but only a little. αμ improved the result of about 1% of bridge deals at about 3.5 times PIMC's time ([Cazenave, Legras & Ventos 2021](https://arxiv.org/abs/2101.12639)). PIMC's own endgame errors in Skat cost 0.063 TP per deal against a standard deviation of 778 ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)). End-to-end learned agents either lose to PIMC in trick-taking (9.8–16.3 points per game behind Kermit in Skat) or need data-centre compute ([Rebstock et al. 2024](https://arxiv.org/abs/2404.13150)). Make-a-Million's own diagnostics agree. Card play stopped improving at three times the nodes, the bid-or-pass choice is close to a coin flip, and most of the +129k-per-hand oracle gap is information ([roadmap](bot-roadmap.md)). The plan in order:

1. A distributional contract-value model, with a ceiling bidding policy and paired evaluation on shared seeded deals.
2. Policy-based inference over all card play, tempered and mixed over partner types.
3. An offline exact endgame diagnostic that decides whether αμ or late-hand recursive PIMC is worth building.

All of it can be deterministic, stateless and pure TypeScript within the budget. The main risk is that every model would be fitted to the bots' own play and then meet humans.

## Make-a-Million's own diagnostics put bidding first and information second

Hard already uses its budget well, and its own measurements show where the remaining equity is. At about 11M solver nodes per second, a 4.5 s decision is worth roughly 50M nodes (my arithmetic). Hard's decisions finish with a p99 of 792 ms against its 1.3 s deadline, so Hard has little room; Expert's 4.5 s target is about five times Hard's p99, so a method that costs three to five times as much as Hard's PIMC fits Expert ([roadmap](bot-roadmap.md)). Spending more on the same search does not help: three times the nodes, one trick deeper, or more endgame worlds "gained nothing measurable" ([roadmap](bot-roadmap.md)). That leaves two kinds of change: better inputs to PIMC (the worlds it samples and the contract values it uses), or reasoning that PIMC cannot do at any budget.

**The card-play gap is mostly hidden information.** An all-seeing oracle playing for Hard gains **+25k points per hand over the last 4 tricks, +67k over the last 7 and +129k over the whole hand**. About 21k of the full gap is knowing where the Tiger, Bull and Bear are, mostly in the first six tricks ([roadmap](bot-roadmap.md)). Specials inference, the one inference model that paid off, recovered **+4.1k [0.7, 7.6] points per hand** (+0.53% equity per board), about a fifth of the specials gap ([roadmap](bot-roadmap.md)). The roadmap says the existing diagnostics cannot separate information that no real player has from PIMC's own flaws. The +25k of the last four tricks lies entirely inside the exact solver's window, which makes it the cleanest place to separate them.

**Bidding is weaker still.** The greedy-playout estimate correlates with the bidder's capture at only **r = 0.48** and badly understates weak hands. Calibrating it was the largest single gain (**+5.7% equity per board**). Yet the calibrated bid and pass branches still come out within about 0.01 equity of each other whatever the hand. Over 1,200 decisions played both ways, the bot's estimated advantage predicted the realised one at **r = −0.015** ([roadmap](bot-roadmap.md)). Each paired rollout carries 25.7% equity of noise, and calibration's gain came from exploiting passive bidders. For scale, Hard beats Normal by +12.7% equity per board, so calibration alone was worth about 45% of the gap between the two levels (my arithmetic). The same experiment found that against calibrated opponents one bid more or less is worth about nothing on average. Any further bidding gain therefore has to come from telling hands apart, which only a sharper evaluator can do.

**Training data sets the last limit.** A 1,000-hand calibration runs in about 13 minutes on 22 workers ([roadmap](bot-roadmap.md)). That is roughly **10^5 Hard hands, or about 5.7M card plays, per day** on this machine (my arithmetic). For comparison, Kermit's bidding tables used 22M human games ([Buro et al. 2009](https://cs.du.edu/~sturtevant/papers/skat.pdf)). Skat imitation networks used up to 289M examples each ([Rebstock et al. 2019b](https://arxiv.org/abs/1905.10907)), and DouZero used about 10^10 environment steps ([Yang et al. 2022](https://arxiv.org/abs/2203.16406)). Make-a-Million can afford tables, small networks and distillation from cheap playouts, but not deep reinforcement learning at those scales.

## Search fixes for PIMC's flaws change about one deal in a hundred

### Strategy fusion and non-locality rarely change the card PIMC picks

Frank and Basin named PIMC's two structural errors ([Frank & Basin 1998](https://doi.org/10.1016/S0004-3702(97)00082-9)). *Strategy fusion*: PIMC assumes it can play differently in worlds it cannot tell apart. *Non-locality*: a node's value depends on parts of the tree outside its subtree, because opponents steer play with private information. Both errors persist however many worlds are sampled ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)). Their fix, payoff-reduction minimaxing, solved **over 95% of a bridge problem database against 66% for Monte Carlo sampling** (abstract only; [Frank, Basin & Matsubara 1998](https://mlanthology.org/aaai/1998/frank1998aaai-finding)). In Kinderschnapsen, however, it and vector minimaxing cost about **600% more evaluation time** than PIMC ([Wisser 2015](https://ijcai.org/proceedings/2015/25)). Long et al. show that fusion changes PIMC's move only under two conditions: moves whose values are anti-correlated in one part of the tree, and a move that is guaranteed to be better elsewhere. Without the safe alternative, PIMC still picks the right move and only overestimates its value ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)). Ginsberg's lattice search removes fusion from bridge declarer play, and it was worth only **0.1 IMPs/deal** ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf); [Ginsberg 2001](https://arxiv.org/abs/1106.0669)).

Make-a-Million meets both conditions. It has finesse-like guesses over who holds the Tiger, a high trump or a large money card, and late swings when the Bull or Bear lands. Its rules add two PIMC blind spots. The declarer's three discards are hidden information that play never reveals. And because every simulated opponent sees Hard's hand, PIMC never values hiding it. That second point is my inference from the non-locality analysis ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)) and from the public-private belief work ([Arjonilla, Saffidine & Cazenave 2023](https://arxiv.org/abs/2405.14346)).

### Long's three properties predict how well PIMC fits, and they can be measured here in a week

Long et al. explain PIMC's success with three properties of the game tree ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)):

- **Leaf correlation (lc):** the probability that sibling terminal nodes have the same payoff.
- **Bias (b):** how often the game favours one side.
- **Disambiguation factor (df):** how fast a player's information set shrinks as play goes on.

On synthetic trees PIMC is weakest when lc is low, and it improves "drastically" as df approaches 1. **Skat and Hearts measured lc between 0.8 and nearly 1.0, with df close to 0.6.** In that region PIMC loses only 0.1 points per game (on a ±1 scale) to a Nash-equilibrium player. Kuhn poker (df = 0) is the case where PIMC can be exploited. The key real-game number comes from Skat endgames. About 15% of games are still undecided with three tricks left, and in those PIMC lost **0.42 TP per deal against a CFR solution**. That is **0.063 TP per deal overall**, "dwarfed" by a standard deviation of 778 ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)).

The measurement procedure carries over directly:

1. Take a few thousand post-discard deals from self-play and run random legal playouts.
2. At each pre-terminal node (one whose children are all terminal once forced moves are collapsed), score the children with the exact solver. Use the binary make-or-set outcome first, then the money margin.
3. lc is the share of these nodes whose children all score the same. b is the share of those agreeing nodes that favour the bidding team.
4. For df, count at each of one player's turns how many deals are consistent with that player's observation. Count exactly over suits and voids, or estimate by sampling. Convert the ratio between that player's consecutive turns into df.

Skat used about 1,000 near-leaf samples per deal ([Long et al. 2010](https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf)). Report Make-a-Million's values separately for positions where the Bull or Bear is still unplayed. My hypothesis is that df will look like Skat's, because each trick shows 4 of the 55 cards. I expect lc to fall below Skat's while a special is unplayed, because one special can double or cancel a trick's money at the last moment, and those are exactly the anti-correlated leaves where PIMC is weakest. Long et al. also note that a game is a cloud of parameter values that varies from hand to hand. A low-lc pocket would therefore justify a targeted fix rather than a new algorithm everywhere.

**The exact endgame diagnostic answers the roadmap's open question directly.** With 3 tricks left, a defender (or the declarer's partner) has 12 unseen cards to place: three 3-card hands plus the 3 discards. That is at most **369,600 layouts before void constraints**. The declarer with 4 tricks left faces **34,650** (my arithmetic). Each layout is a tiny exact solve, so an offline run can:

1. Enumerate every consistent world.
2. Solve the decision exactly: αμ over all worlds, which is exact under "opponents see all cards, my own moves are not fused", or an information-set expectimax against a fixed opponent model.
3. Compare the result with PIMC's choice at 40 worlds.

Edelkamp's exact enumeration of Skat belief spaces after 5–6 tricks is a precedent (abstract only; [Edelkamp 2020](https://ebooks.iospress.nl/pdf/doi/10.3233/FAIA200118)). The share of the +25k last-four-tricks oracle gap that this exact solve recovers is the most any late-hand search fix can earn. The rest is information. Published decompositions predict a small share. In Dou Di Zhu a cheating player beat determinized UCT **56.5% to 43.6%**. ISMCTS, which removes the searcher's strategy fusion, recovered none of that gap overall (**42.3%**). It helped only on the 1,421 of 5,000 deals where cheating was significantly better ([Cowling, Powley & Whitehouse 2012](https://eprints.whiterose.ac.uk/75048/1/CowlingPowleyWhitehouse2012.pdf)).

### αμ is the only post-PIMC search with a measured trick-taking gain

**How αμ works.** It searches over a set of sampled worlds ([Cazenave & Ventos 2019](https://arxiv.org/abs/1911.07960)):

- Max, the bridge declarer who also controls the visible dummy, must play the same move in every world still consistent with the play so far.
- Min, the defence, keeps perfect information and may choose a different move in each world.
- A node's value is a Pareto front of win/loss vectors over the worlds. Max nodes take the union of their children's fronts. Min nodes take the element-wise minimum over combinations of their children's fronts, which also captures non-locality.
- The parameter M counts Max moves before the double-dummy leaf. M = 1 is PIMC.

**Bridge evidence.** The first test used 500 no-trump deals that PIMC wins 30–70% of the time. At 20 worlds, M = 2 raised contracts made from **60.2% to 63.0%**. At 40 worlds both PIMC and M = 2 scored 62.4%, and only M = 3 reached 63.2%. Only **169–388 of 13,000 moves differed from PIMC** ([Cazenave & Ventos 2019](https://arxiv.org/abs/1911.07960)). A follow-up played 10,000 7NT deals, αμ against PIMC with PIMC defence. The outcome differed on 757 deals, and αμ won 55.1% of those (σ 0.018). That is a net improvement on about **0.8% of all deals** (my arithmetic). Across the defence types tested, the net improvement ranged from about 0.8% to 1.4% of deals ([Cazenave, Legras & Ventos 2021](https://arxiv.org/abs/2101.12639)).

**Cost.** At 20 worlds, M = 2 took 0.067 s per move against PIMC's 0.019 s, about 3.5 times as long. M = 3 or 4 did not improve results. With leaf parallelisation, αμ M = 2 at 40 worlds took about as long as PIMC at 160 worlds, and it won more ([Cazenave, Legras & Ventos 2021](https://arxiv.org/abs/2101.12639)).

**Transferring αμ to Make-a-Million raises three problems.**

1. **The partner is hidden.** Every published result is declarer play with a visible partner. A hidden partner corresponds to bridge defence, which αμ's authors left as future work. A 2024 paper that extends αμ to "more players in a team" and to trick costs is known only from a search snippet ([Bounan & Edelkamp 2024](https://api.crossref.org/works/10.1007/978-3-031-63735-3_3), unverified). The practical choice is to remove fusion only from Hard's own moves and leave partner seeing all cards, like the opponents. That is no worse than PIMC. Grouping worlds by partner's hand would end up at the same place, because 40 sampled worlds rarely share a partner hand.
2. **The objective must be binary.** αμ needs a win/loss outcome per world. Make-a-Million supplies one: the bidding team captures at least its bid or it does not. Ties should be broken on PIMC's mean money.
3. **Cost per extra M is likely steeper.** Make-a-Million has three non-Max moves between each of Hard's moves, so each extra M probably costs more than bridge's 3.5 times. Expert's 4.5 s target is about 5 times Hard's p99 of 0.8 s, but the first prototype must measure nodes per decision. αμ deepens iteratively and can stop at any point, so it must stop on a node count, not a clock, to stay deterministic.

**A cheap add-on comes with it.** A vector of all ones in Max's front means the contract is made in every sampled world. That gives the "sure make" check of Edelkamp's knowledge-based paranoia search almost for free. That Skat engine won 1,342 series and lost 248 against humans on a server ([Edelkamp 2021](https://arxiv.org/abs/2104.05423)). The figure is for the whole engine, not the check alone.

Two later papers generalise αμ's machinery but give no usable trick-taking gain. Li et al. prove lattice-valued alpha-beta correct; their results were not extracted ([Li et al. 2022](https://www.ijcai.org/proceedings/2022/661)). A 2024 paper searches with partial opponent models (abstract only; [Li, Zanuttini & Ventos 2024](https://ojs.aaai.org/index.php/AAAI/article/view/28844)).

### Recursive PIMC is the one search that stops partner seeing hidden cards

IIMC evaluates moves with playouts in which every player acts on its own imperfect information: each runs a lower-level PIMC from its own simulated observation. The recursive form, RecPIMC, "performs considerably better than PIMC" in synthetic games and in Skat (abstract only, no numbers obtained; [Furtak & Buro 2013](https://api.openalex.org/works/doi:10.1109/CIG.2013.6633646)). In 13-card bridge no-trump play, level-one recursive Monte Carlo beat flat Monte Carlo by **0.5 tricks per deal** (abstract snippets only; [Bouzy, Rimbaud & Ventos 2020](https://dblp.uni-trier.de/rec/conf/cig/BouzyRV20.html)). It "takes much more time to complete than PIMC" ([Cazenave, Legras & Ventos 2021](https://arxiv.org/abs/2101.12639)). It also gives no exact endgame results and does not fix non-locality ([Cazenave & Ventos 2019](https://arxiv.org/abs/1911.07960)). Ginsberg's attempt to defend from partner's point of view in GIB lost **about 0.05 IMPs/deal**, because the recursion forced a much smaller sample ([Ginsberg 2001](https://arxiv.org/abs/1106.0669)).

Its appeal for a 2v2 game is that partner's simulated card comes from partner's own simulated observation, so the simulated partner cannot use cards it could not see. Neither αμ nor PIMC offers that. The cost is roughly k candidate moves × N outer worlds × about 4T inner decisions with T tricks left (my estimate). That is far beyond 50M nodes early in the hand, but small with 3–6 tricks left, where each inner decision is a tiny exact solve. Deriving inner seeds from the outer seed and the world index keeps it deterministic. A cheaper relative drives partner's nodes with a fixed policy (see the partnerships section). Both deserve a late-hand experiment, judged at equal compute.

### ISMCTS, extended PIMC, presumed-value PIMC, GO-MCTS and game-theoretic search do not fit

**Information Set MCTS (ISMCTS)** builds one tree over the searcher's information sets. That removes the searcher's own strategy fusion, but each iteration costs 2–4 times as much as determinized UCT. It clearly beat determinization in *Lord of the Rings: The Confrontation* and in Phantom (4,4,4). In the card game Dou Di Zhu it was on par (42.3% against 43.6%), because the information-set tree branches orders of magnitude more ([Cowling, Powley & Whitehouse 2012](https://eprints.whiterose.ac.uk/75048/1/CowlingPowleyWhitehouse2012.pdf)). It would also give up Hard's main asset, the exact solver.

**Extended PIMC** delays the perfect-information evaluation to depth d and solves the resulting subgame with a method that does not fuse strategies. It helped strongly in Dark Chess and Dark Hex. But "for Card Game and Battleship, increasing the depth does not lead to any improvement as both games have a majority of their observation public" ([Arjonilla, Saffidine & Cazenave 2024](https://arxiv.org/abs/2408.02380)).

**Wisser's presumed-value PIMC** corrects PIMC's "overestimation of opponent's knowledge of hidden information in future game states". It won about **53.6% of 100,000 Kinderschnapsen matches** against standard PIMC at +30% evaluation time. Against humans it won 58.9%, against standard PIMC's 53.8% ([Wisser 2015](https://ijcai.org/proceedings/2015/25)). It is cheap and targets the right error. But the detailed numbers came through a summarising extraction, the algorithm itself was not read, and Schnapsen has no partner.

**GO-MCTS** runs MCTS in observation space with a GPT-2-style model. It became the strongest Hearts program, +1.74 points per hand over the PIMC/UCT bot xinxin, at about 25.6 s per turn. In Skat it stayed 9.84 points behind Kermit's PIMC at about 42 s per turn ([Rebstock et al. 2024](https://arxiv.org/abs/2404.13150)).

**Student of Games** has no trick-taking application. Its guarantees, like ReBeL's, cover only two-player zero-sum games ([Schmid et al. 2023](https://arxiv.org/abs/2112.03178)). Their cost is covered in the learning section.

In the verdict tables, "Constraint fit" lists which of the seven constraints a technique strains: determinism per observation and seed (Det), no state between decisions (Stateless), observation-only inputs (Obs), 4.5 s on one thread (Time), budgets counted in nodes or samples (Budget), pure-TypeScript inference (TS), and training on 24 cores plus an optional 8 GB GPU (Train). "All" means a technique meets all seven.

| Technique | Evidence (game; gain; compute) | Constraint fit | Build / runtime here | Verdict |
|---|---|---|---|---|
| Long's lc/b/df measurement plus an exact endgame diagnostic | Skat: PIMC's endgame flaws cost 0.063 TP/deal (SD 778); Skat/Hearts lc 0.8–1.0, df ≈ 0.6 | Offline, so the runtime constraints do not apply; Train: 24 cores are ample | 3–5 days; offline | **Adopt** |
| αμ, M = 2, exact window only; own moves de-fused, partner sees all, make/set objective | Bridge NT declarer: 60.2→63.0% on close deals at 20 worlds; about 0.8–1.4% of deals improve; 3.5× PIMC time per move; M ≥ 3 no better | All, but Budget needs a node-count stop and Time is tight (at least 3.5× per world) | 800–1,500 lines of TS, 1.5–3 weeks | **Try**, if the diagnostic finds several k/hand of fusion |
| "Sure make / sure set" check on αμ fronts (knowledge-based paranoia search idea) | Skat engine: 1,342 vs 248 series against humans (whole engine) | All | +2–3 days on top of αμ; nearly free | **Try**, with αμ |
| RecPIMC / IIMC at 3–6 tricks left, on the top two moves | Skat "considerably better" (abstract only); bridge NT +0.5 tricks/deal (snippet); GIB's recursive defence −0.05 IMPs at equal time | All late in the hand; Time fails early in the hand | 200–400 lines, 3–5 days; compute-bound | **Try**, gated by the diagnostic |
| Presumed-value PIMC | Kinderschnapsen 53.6% vs PIMC; humans 58.9% vs 53.8%; +30% time | All; a 2-player method, so how it treats a partner is unknown | About 1 week after reading the paper; +30% | **Later** |
| Vector minimaxing / payoff-reduction minimaxing | Bridge problems 95% vs 66% (abstract only); +600% time in Kinderschnapsen | Time: about 7× fewer worlds | n/a | **Skip** (αμ covers it) |
| GIB lattice search | Bridge declarer +0.1 IMPs/deal | Time: about 100× per extra card | n/a | **Skip** |
| SO-ISMCTS | Dou Di Zhu 42.3% vs 43.6% determinized; 2–4× slower per iteration | All, but it thins out the exact solver's budget | 1–2 weeks plus playout tuning | **Skip** |
| Extended PIMC (delayed reasoning) | No gain from depth in a trick-taking test game | All | 1–2 weeks | **Skip** |
| GO-MCTS | Hearts +1.74 points/hand at 25.6 s/turn; Skat −9.84 vs Kermit at 42 s | Time and TS fail | Months | **Skip** |
| Student of Games, ReBeL, safe subgame solving | Poker, Scotland Yard; no trick-taking use | Time, TS and Train fail; theory covers two-player zero-sum games only | Months | **Skip** |

## Learned inference is the largest proven card-play gain, as long as the weights do not starve the pool

**Policy-based inference (PI)** weights each sampled world by a product: for every other player's past action, the learned policy's probability of that action in that world. The searcher's own actions count as 1, and nothing is smoothed ([Rebstock et al. 2019](https://arxiv.org/abs/1905.10911)). The test held Kermit's PIMC card play fixed and played 5,000 matches per game type. PI beat learned card-location inference by **+2.32 TP/G in suit games (19.50 against 17.18)**, +0.64 in grand (not significant) and +1.57 in null. It beat no inference by 10.43, 3.55 and 6.33. The gain came "mostly from the defenders" ([Rebstock et al. 2019](https://arxiv.org/abs/1905.10911)). PI took about five times as long per move as card-location inference and sampled 20,000–100,000 card layouts per decision; larger pools helped in suit and grand games. Its policies were MLPs trained on human games, with up to 2.3M weights, at about 2.5 ms per move ([Rebstock et al. 2019b](https://arxiv.org/abs/1905.10907)).

**Card-location inference (CLI)**, PI's predecessor, makes one network pass per decision. The pass predicts, for each of Skat's 32 cards, a probability for each of its four possible locations. A world is weighted by the product of its cards' probabilities ([Solinas, Rebstock & Buro 2019](https://arxiv.org/abs/1903.09604)). Trained on 20M human games, it beat Kermit's table inference by **+4.7 / +2.1 / +4.8 TP/G** (suit / grand / null), and no inference by +8.3 / +4.0 / +10.8, at 320 worlds. It took 0.286 s per action against 0.093 s. Kermit's own inference had already stopped improving at 160 worlds, so more time would not have closed the gap. Because CLI treats cards independently, it cannot express "this card or that one, but not both"; PI adds that. Kermit's tables model P(hand features | bid), fitted from generated bidding data. They lifted card play from **779 to 996 points per 36-game series** over no inference. Against the very different XSkat, in full games, they neither helped nor hurt ([Buro et al. 2009](https://cs.du.edu/~sturtevant/papers/skat.pdf)).

**Three results limit what better beliefs can buy.**

- **Knowing the true world can hurt PIMC.** In Skat, a PIMC player given the true world did worse than CLI in suit (−3.25 TP/G) and grand (−8.49) games, and won only in null ([Rebstock et al. 2019](https://arxiv.org/abs/1905.10911)). The authors leave the cause open. My hypothesis: a defender who plays as if its partner also knows everything is punished when the partner does not.
- **Better models barely matter once double-dummy analysis picks the card.** BEN's 2026 bridge play models predicted the card actually played more accurately. They gained +1.47 IMPs/board when the network chose the card. With double-dummy analysis over the samples choosing the card, the gain was only +16 to +33 IMPs over 500 deals, not significant ([BEN release notes 0.9.0.0](https://github.com/lorserker/ben/blob/main/install/release-notes-0.9.0.0.md)).
- **Weights on a poor pool can make things worse.** In Gongzhu, ScrofaZero's tempered likelihood weights on a uniform pool scored worse than no weights (**54.5 ± 4.7 against 59.6 ± 3.3**). The same weights on a stratified pool scored 73.9 ± 3.3 ([Shi, Li & Sun 2021](https://arxiv.org/abs/2102.07495)).

Weights help only when the candidate pool already contains plausible worlds and the likelihoods are soft.

Bridge engineers learned the same lesson by hand. **GIB** works as follows ([Ginsberg 2001](https://arxiv.org/abs/1106.0669)):

1. It deals hands that meet suit-length limits derived from the auction.
2. It rejects deals in which its own bidding module would not have made the observed calls.
3. It reweights the survivors by Bayes odds from card play ("odds of 4:1 that he hasn't got it").

It uses about 50 deals per decision. With 100 deals, more time and hand-written explanations of the opponents' bids, it solved 64.4% of Bridge Master problems instead of 55.6%. Kermit's authors avoided such self-simulated 0/1 likelihoods as "brittle in the face of players who do not play identically to ourselves" ([Buro et al. 2009](https://cs.du.edu/~sturtevant/papers/skat.pdf)).

**BEN's sampling during play** ([BEN default.conf](https://github.com/lorserker/ben/blob/main/src/config/default.conf); [BEN sample.py](https://github.com/lorserker/ben/blob/main/src/sample.py)):

- It generates 5,000 deals and keeps 200.
- It scores each deal by the *minimum*, over a seat's actions, of the network's probability of the action actually taken, rather than by the product.
- It trusts opponents' plays less than partner's (thresholds 0.03 against 0.1).
- It lowers the threshold in 0.01 steps until at least 10 samples survive.
- It enumerates every layout once 14 or fewer cards are unknown.

BEN's release notes show what goes wrong without these guards. A mismatched model of how an opponent bids left "about one deal in a thousand" consistent with a constructive auction, so opening leads were "chosen on about 20 samples instead of 200". A mismatched opening-lead convention check down-weighted the true layouts ([BEN 0.9.0.1](https://github.com/lorserker/ben/blob/main/install/release-notes-0.9.0.1.md)). Make-a-Million's auction and trump weighting gained nothing ([roadmap](bot-roadmap.md)), which fits this failure mode. The roadmap itself notes that the heuristic auction model's ceilings do not match how the bots actually bid.

**Learned belief generators go a step further: they sample hidden hands directly instead of reweighting uniform deals.**

- **Learned Belief Search (LBS)** replaced SPARTA's exact belief tracking in Hanabi with an autoregressive network trained on self-play of a fixed blueprint policy. It recovered **55–91% of SPARTA's gain at 4.6–35.8 times less compute**. Its beliefs are valid only while the other players follow the blueprint, and running it for both players lowered the score (24.34 against 24.48) ([Hu et al. 2021](https://arxiv.org/abs/2106.09086)).
- **Ataraxos** uses a 3.3M-parameter autoregressive transformer belief in dou dizhu with 200 rollouts per decision. It beat PerfectDou by **+0.199 ± 0.015** over 10,000 duplicated deals ([Sokota et al. 2025](https://arxiv.org/abs/2511.07312)).
- **AI Factory's Spades tables** sit at the cheap end. They are per-card probability tables driven by about ten rule-of-thumb heuristics. They cut the mean card-location error from 44.4% to about 26% and raised the points-winning rate by **15.4%** over inference from voids alone ([Rollason 2019](https://aifactory.co.uk/newsletter/2018_02_opponent_hand.htm)).
- **Edelkamp's declarative rules** ("does not hold this card" and card-count limits) raised a Skat engine's self-play win rate from 84.65% to 85.84% over 83,844 games ([Edelkamp 2026](https://arxiv.org/abs/2610.38304)).

Two Hanabi methods do not survive Make-a-Million's belief space or budget: SPARTA's exact belief tracking and test-time belief fine-tuning ([Sokota et al. 2022](https://research.facebook.com/file/291538229793451/A-Fine-tuning-Approach-to-Belief-State-Modeling.pdf)).

For Make-a-Million, **PI is the natural generalisation of the specials model**, which is already a PI limited to a few situations. It is stateless by construction, because the weights are recomputed from the full history at every decision. Exact enumeration is out of reach: at the first trick the declarer faces about 8×10^16 consistent deals and a defender about 10^21 (my arithmetic), against at most 42 million in Skat.

**The cost** is one policy evaluation per candidate world per past action of another seat. A small network (252 one-hot inputs, then 32 and 16 hidden units) measured **2.0–3.7 µs per sparse forward pass** in plain scalar TypeScript on this machine (local measurement, random weights). The current 240-world pool, with up to 39 past plays, would cost about 30 ms. A 2,000-world pool would cost about 0.3 s (my arithmetic). Both fit inside Expert's budget; the smaller pool might fit Hard's.

**The real risk is degeneracy.** A product of about 40 probabilities piles the weight onto a handful of the 240 candidates. The design therefore needs:

- a larger, cheap candidate pool;
- tempered likelihoods, raised to a power below 1 or mixed with uniform over the legal cards, as ScrofaZero's temperature does;
- BEN's role-specific floors and minimum-sample rule, which are deterministic given the seeded pool;
- ScrofaZero's restriction to "important" actions, which also cuts cost;
- a log of the effective sample size.

A card-location network can later serve as the proposal distribution, so that the PI weights correct a pool that already contains plausible worlds.

Training data is cheap, because every self-play card play is a labelled example. But the model will describe the bots' own play. It must be refitted whenever play changes, as the specials model is, and its gain must be measured with Normal and Easy partners and opponents as well as Hard.

| Technique | Evidence (game; gain; compute) | Constraint fit | Build / runtime here | Verdict |
|---|---|---|---|---|
| Policy-based inference over all card play: small factored network, tempered, important actions only | Skat: +2.32 / +0.64 (ns) / +1.57 TP/G vs CLI; +10.43 / +3.55 / +6.33 vs none; about 5× CLI's time; human-trained nets of up to 2.3M weights | All; the adaptive floor must step deterministically | 1–2 weeks; about 30 ms (240 worlds) to 0.3 s (2,000 worlds) | **Adopt** |
| BEN-style sampling plumbing: large pool, minimum or tempered scores, role trust, adaptive floor, effective-sample-size log, enumeration when few cards are unknown | Bridge: a model mismatch cut samples from 200 to 20; no isolated gain measured | All | 2–4 days; negligible | **Adopt** |
| Card-location network as PI's proposal | Skat: +4.7 / +2.1 / +4.8 TP/G vs Kermit's tables at 320 worlds; 3.1× time | All | About 1 week, shares PI's pipeline; one pass plus O(55) per world | **Try** |
| Rule-based card reading: heuristic per-card tables, declarative "does not hold" rules | Spades +15.4% points-winning rate; Skat 84.65→85.84% wins | All | Days; negligible | **Try** |
| GIB's rejection by its own bidding module | Bridge Master 64.4% vs 55.6% (three factors combined) | All, but 0/1 likelihoods are brittle | 2–3 days | **Try**, only as the soft censoring in the bidding plan |
| Kermit-style feature tables | Skat 996 vs 779 per 36 games over none; about 0 vs XSkat | All | Already built (specials model) | Keep; little upside left |
| Autoregressive learned belief generator (LBS, Ataraxos) | Hanabi: 55–91% of SPARTA's gain at 4.6–35.8× less compute; dou dizhu +0.199 vs PerfectDou | All, but TS is tight (decoder in TS) | 2–3 weeks; tens of ms (estimate) | **Later** |
| Public/private belief mixture (protects own information) | Small benchmark games only | All | Not estimated | **Later** |
| SPARTA exact beliefs; belief fine-tuning | Hanabi 24.08→24.61 | Time: enumeration and test-time training | n/a | **Skip** |

## Bidding needs a learned contract value and a model of how the bots really bid

### Skat bots value hands with fast learned evaluators, not playouts

No strong Skat bot plays the deal out at bid time. **Kermit's "10+2 evaluation"** is a logistic regression over table features, fitted on 22M human server games, that estimates the soloist's win probability ([Buro et al. 2009](https://cs.du.edu/~sturtevant/papers/skat.pdf)). Bidding is an expectimax: an average over all 231 possible skats, then a choice of game type, then a choice among all 66 discards. That is up to **92,862 evaluations "in a fraction of a second"**. Kermit bids while the value at the root is at least B = 0.6, a threshold chosen in self-play. It predicts win probability rather than card points, because "winning with 61 or 75 card points makes no difference". It also warns that open-hand values of null games "severely underestimate the soloist's winning chance".

**Rebstock et al. replaced Kermit's bidding with networks trained on human games** ([Rebstock et al. 2019b](https://arxiv.org/abs/1905.10907)). A max-bid network bid up to the A-th percentile of its predicted distribution, and value networks handled the hand/pick-up and declare decisions. A plain argmax over the value network lost **75.59 TP/G** to Kermit. It played 96% of suit games as hand games, because rarely seen actions looked spuriously good. Restricting the argmax to actions with policy probability of at least 0.1 turned the same networks into the best system: **+1.17 TP/G over Kermit** at A = 0.85. Plain imitation lost 2.10 TP/G.

**Later Skat work.** Edelkamp's 2025 engine still uses win-probability tables. It refines them with 30M self-play games, which took more than a month on 16 cores ([Edelkamp 2025](https://arxiv.org/abs/2512.15435)). A 2024 attempt to learn bidding end to end by self-play was unstable from scratch: "the players learned to not bid at all". Even after seeding, it finished 16.31 points per game behind Kermit ([Rebstock et al. 2024](https://arxiv.org/abs/2404.13150)).

### Bridge search bids by paired rollouts with the bot's own policy

**GIB's Borel simulation** works as follows ([Ginsberg 2001](https://arxiv.org/abs/1106.0669)):

1. Sample deals consistent with the auction so far.
2. For each candidate call and deal, project the rest of the auction with the rule database.
3. Score the final contract double-dummy.
4. Pick the call with the highest total score over the same deal set.

It "introduces substantial instability". With a conservative database, each player overbids to compensate, so "the partnership as a whole ends up overcompensating", and the search exploits gaps in the model.

**Lockhart et al. fixed both failure modes** ([Lockhart et al. 2020](https://arxiv.org/abs/2011.14124)). They roll out with the bot's own current policy, repeat the process over rounds of policy iteration, and blend the search result softly into the prior only after a minimum number of rollouts. Rolling out with an imitation model of WBridge5 instead "produces policies which perform well against π_b, but not against WBridge5". Their partnership agent with search at test time reached **+0.85 ± 0.05 IMPs/deal** over WBridge5.

**BEN, the open-source bridge engine, uses the same structure** with explicit plumbing ([BEN botbidder.py](https://github.com/lorserker/ben/blob/main/src/botbidder.py); [BEN default.conf](https://github.com/lorserker/ben/blob/main/src/config/default.conf)):

- candidates are the calls whose network probability exceeds a threshold;
- it uses 200 auction-consistent deals drawn from up to 30,000, and the same deal array for every candidate;
- its random number generator is seeded from the hand, so each decision is reproducible;
- it adds a bonus for the network's prior;
- it falls back to the network's ordering when sample quality is below 0.70 or fewer than 15 deals survive.

**Learned bridge bidders without search have since gone further.** One reached **+1.24 ± 0.19 IMPs/board** over WBridge5 with PPO and fictitious self-play ([Kita et al. 2024](https://arxiv.org/abs/2406.10306)). Another reports +0.98 IMPs/deal with a belief network feeding Monte Carlo search (abstract only; [Qiu et al. 2024](https://www.ieee-jas.net/article/doi/10.1109/JAS.2024.124488)). But bridge bidding is a communication problem over 38 possible calls. Make-a-Million's auction is close to a one-dimensional ascending auction in which a pass is final.

### Widow and trump games reward learned evaluators over search

**DouDizhu is the closest analogue**: three hidden landlord cards go to the auction winner. AlphaDou's bid networks, which condition on earlier bids, raised the first bidder's win rate from **0.361 to 0.411** over 4,000 games ([AlphaDou 2024](https://arxiv.org/abs/2407.10279)). The baseline they replaced was a supervised network whose labels were the mean score of 1,000 DouZero rollouts per fixed hand.

**Other games point the same way:**

- **Jass:** a two-layer DNN trump selector beat MCTS trump selection (48.23 ± 1.98% of points against the DNN; p = 0.012), partly because MCTS "rarely passes". A ranked rule-based selector was almost as good as the DNN ([Niklaus 2019](https://joelniklaus.github.io/files/theses/Master_Thesis.pdf)).
- **Spades:** AI Factory found MCTS poor at bidding and used knowledge-based bidding ([Whitehouse et al. 2013](https://ojs.aaai.org/index.php/AIIDE/article/view/12679)). The BIS bidder compares the expected utility of each bid using Monte Carlo tables corrected by machine learning on real games, and it beat humans in 56% of games ([Cohensius et al. 2020](https://arxiv.org/abs/1912.11323)).
- **Doppelkopf:** announcing, which raises the game's value, more than doubled a UCT player's score against random filler players (**1.70 against 0.79**) ([Sievers & Helmert 2015](https://ai.dmi.unibas.ch/papers/sievers-helmert-ki2015.pdf)).

In none of these games did search-based bid or trump choice beat a good learned or rule-based evaluator.

### The roadmap's bidding symptoms match the literature's failure modes

Each of the roadmap's bidding numbers has a published explanation:

- **The estimate predicts capture poorly and understates weak hands.** That is the bias of open-hand values that Kermit's authors saw in null games.
- **Bid and pass come out nearly tied.** That is what comparing two differently built, unpaired estimators produces: a rollout values the bid branch, while a heuristic auction model values the pass branch. This is GIB's problem of a rule database inside the rollout.
- **Calibration's gain came from exploiting passive bidders.** That is Lockhart's warning: a search exploits the weaknesses of the model it rolls out against ([roadmap](bot-roadmap.md); [Lockhart et al. 2020](https://arxiv.org/abs/2011.14124)).

### The fix is a contract-value distribution, a ceiling policy and paired evaluation

**A contract-value model (CVM)** should predict the *distribution* of the declaring side's capture, not its mean:

- **Inputs:** the declarer's hand after the widow (or its 13 cards after the discard), the named trump, which specials it holds, the seat and opening lead, the winning bid, and each seat's last bid or pass level.
- **Output:** a softmax over capture bins (for example $5k wide). One pass gives P(capture ≥ b) for every bid b, plus the expected capture, and both plug directly into the match-equity table.

This design copies three published choices: Kermit's win-probability target, AlphaDou's separate win-rate and expected-value outputs, and the 397-class outcome head used for Skat in 2024 ([Buro et al. 2009](https://cs.du.edu/~sturtevant/papers/skat.pdf); [AlphaDou 2024](https://arxiv.org/abs/2407.10279); [Rebstock et al. 2024](https://arxiv.org/abs/2404.13150)).

**Train it in two stages:**

1. Distil the existing greedy-playout estimator, as DouZero's bid network was: label each hand with the mean of many playouts. This gives millions of labels cheaply.
2. Fine-tune on the actual outcomes of Hard self-play, at about 10^5 hands per day.

The roadmap proposes solver "par" values as labels. Open-hand values are systematically biased, so par values should enter only as an auxiliary input or target. PerfectDou did the same with its all-seeing critic, which was worth **+0.04 win probability** at equal samples ([Yang et al. 2022](https://arxiv.org/abs/2203.16406)). A Kermit-style table model is a sound first version and trains in minutes: per-suit honour-and-length patterns × trump × specials, with ordinal logistic thresholds.

**Judge the model by held-out log loss of the capture distribution and by duplicate match equity, not by r.** Much of the remaining variance is card luck no model can remove. No published bidding model reports r against real outcomes, so r ≈ 0.5 has no outside benchmark.

**On top of the CVM, use a ceiling policy:** the bot's ceiling c is the largest bid at which equity(declare at c) − equity(defend) is at least a margin. Tune the margin in self-play, as Kermit tuned B and Rebstock tuned A. Model the other three bidders with the same ceiling function, applied to each sampled hand. Treat their actions as censored observations: a pass at b means their ceiling is below b, and still bidding means it is at least the current bid. Weight auction-consistent worlds accordingly, and refit over two or three rounds, as Lockhart did. Evaluate pass and each bid candidate on the same seeded deal set, as GIB and BEN do, and fall back to the ceiling policy as BEN falls back to its network when samples are poor. Jump bids come later. They pay only to price out a seat whose ceiling lies between the minimum bid and the jump, and the evidence for them is from bridge only.

### Widow, discard and trump decisions should average over widows, then maximise

The declarer sees the widow before discarding and naming trump. The right structure is therefore Kermit's pick-up branch: average over widows, then maximise over trump and discard, then evaluate. Kermit's other branch lets the soloist "know" the skat in advance, and it was over-optimistic ([Buro et al. 2009](https://cs.du.edu/~sturtevant/papers/skat.pdf)).

Make-a-Million has 11,480 possible widows (my arithmetic). The procedure:

1. Sample 64–256 seeded widows, weighted by consistency with the auction.
2. For each, keep a few trump and discard candidates.
3. Score them with the post-widow CVM. That is about 5,000 calls, roughly 50 ms with a 64-wide network at the measured 5–11 µs per call (local measurement; my arithmetic).
4. Take the maximum only over candidates the model has seen often, or shrink the estimates before comparing them. Rebstock's −75.59 TP/G shows that a maximum over noisy values selects errors.
5. Re-check the top two or three with the existing shallow search.

It would also make the discard and trump decisions far cheaper than today's search re-check, which needs a node cap to fit Expert's reply time (`bot-ladder.md`, Timing).

**Match equity can borrow from Suphx.** Suphx trains a GRU to predict the final game result from per-round scores, so that the agent maximises the game result rather than the round score. The agent with this predictor ranks above the one without it ([Li et al. 2020](https://arxiv.org/abs/2003.13590)). Make-a-Million already plays to a match-equity table, but two 20,000-game tables differ by **1.6% equity per cell** ([roadmap](bot-roadmap.md)). Fitting a smooth parametric model to the same simulated matches is the cheap Suphx-style fix. It changes every equity decision at once, so it needs its own duplicate test.

| Technique | Evidence (game; gain; compute) | Constraint fit | Build / runtime here | Verdict |
|---|---|---|---|---|
| Contract-value distribution model: distilled from playouts, fine-tuned on outcomes, par values auxiliary only | Skat: Kermit reached expert level from 22M games; Rebstock's gated value nets +1.17 TP/G; AlphaDou's win-rate and expected-value outputs | All | About 2 weeks including data; µs per call (tables) to under 1 ms (MLP) | **Adopt** |
| Max restricted to well-supported actions, or shrinkage before comparing | Skat: plain argmax −75.59 TP/G; gated +1.17 | All | Days | **Adopt** |
| Ceiling bidding policy with a tuned margin | Skat: Kermit B = 0.6; Rebstock percentile A = 0.85 | All | Days | **Adopt** |
| Opponent ceilings from the bot's own ceiling function, censored by passes, refitted by policy iteration | Bridge: own-policy rollouts reached +0.85 IMPs; heuristic-model rollouts were unstable (GIB) | All | About 1 week | **Adopt** |
| Paired evaluation on shared seeded deals, with a sample-quality fallback and a prior | Bridge: GIB, BEN, Lockhart | All | 3–5 days; hundreds of deals × µs | **Adopt** |
| Widow expectimax with the post-widow CVM | Skat: 92,862 evaluations in a fraction of a second | All | 3–5 days after the CVM; about 50 ms | **Adopt** |
| Smoothed match-equity model (Suphx-style final-result prediction) | Mahjong: the ablation ranks it above the version without it (plots only); Make-a-Million table noise 1.6%/cell | All | 2–3 days; a lookup | **Try** |
| Jump bids scored by Borel rollouts | Bridge only | All | About 1 week | **Later** |
| Reinforcement-learned bid networks (AlphaDou, Kita) | DouDizhu win rate 0.361→0.411; bridge +1.24 IMPs/board | Train: needs a full-game policy trained on a GPU | Weeks | **Later** |
| End-to-end self-play reinforcement learning of the auction | Skat: players learned not to bid; −16.31 vs Kermit | Train | n/a | **Skip** |
| Solver par values as the main label | Kermit: open-hand null values are severely biased | All | n/a | **Skip** (auxiliary only) |

## End-to-end learned agents lose to PIMC in trick-taking, but small distilled models fit one thread

### Full learned agents need far more compute than 24 cores

**DouZero** is the template for model-free card-game agents. It is Monte Carlo Q-learning with an LSTM and a 6×512 MLP, trained on one server with 48 CPU threads and four GPUs. It beat the search-based DeltaDou after about **10 days** (win probability 0.586) and needs one forward pass of about 2 ms per move on a CPU ([Zha et al. 2021](https://arxiv.org/abs/2106.06135); [Yang et al. 2022](https://arxiv.org/abs/2203.16406)).

**PerfectDou** trains its critic on all players' hands while the policy sees only its own observation ("perfect-training-imperfect-execution"). It beat DouZero at **win probability 0.541** after 2.5e9 steps on **880 CPU cores and 8 GPUs**. The all-seeing critic alone was worth about +0.04 at equal samples ([Yang et al. 2022](https://arxiv.org/abs/2203.16406)).

**Suphx** reached 10 dan on Tenhou. Its techniques were "oracle guiding" (a perfect-information agent whose extra features are gradually dropped out), the final-result predictor described above, and run-time policy adaptation. Training cost 44 GPUs for two days per agent. The adaptation step won 66% against the unadapted version, but it was left out of online play because it was too slow ([Li et al. 2020](https://arxiv.org/abs/2003.13590)).

**ReBeL and Student of Games** are sound and superhuman in two-player zero-sum poker, but they do not fit here. Their value networks take a belief vector over every possible hand: **2 × 1,326 entries in hold'em**. Make-a-Million has about 2.55×10^10 possible holdings for one unseen 13-card hand. ReBeL generated its data on 90 DGX-1 machines, and Student of Games used TPU resources comparable to AlphaZero's ([Brown et al. 2020](https://arxiv.org/abs/2007.13544); [Schmid et al. 2023](https://arxiv.org/abs/2112.03178)).

### In trick-taking, learned card play wins only in Hearts

The trick-taking record for learned card play is narrow. **Skat:** imitation card play was "slightly weaker than the current best search-based method", though orders of magnitude faster (2.5 ms against about 650 ms) ([Rebstock et al. 2019b](https://arxiv.org/abs/1905.10907)). The transformer policy lost to Kermit by 16.31 points per game, and by 9.84 with search on top ([Rebstock et al. 2024](https://arxiv.org/abs/2404.13150)). **Hearts is the exception:** the same transformer policy beat the PIMC/UCT bot xinxin by **0.95 points per hand at 71 ms per turn** ([Rebstock et al. 2024](https://arxiv.org/abs/2404.13150)), and a linear temporal-difference learner beat a strong search program in 2006 (snippet only; [Sturtevant & White 2006](https://www.springerprofessional.de/feature-construction-for-reinforcement-learning-in-hearts/2891304)). **Wizard:** deep Q-learning agents beat only random and rule-based baselines ([Schumacher & Pleines 2022](https://arxiv.org/abs/2205.13834)). Edelkamp's 2025 paper notes that deep networks have had "only marginal impact" in Bridge or Skat (snippet; [Edelkamp 2025](https://arxiv.org/abs/2512.15435)).

Hearts has no contract and no partnership, and PIMC's flaws matter more there. Make-a-Million's bidding, widow, named trump and contract make it a Skat-like game. Expect learned card-play *policies* to lose to Hard, and learned *components* to help it.

### A distilled leaf evaluator fits the budget, but local evidence says the leaf is not the bottleneck

Using a learned evaluation as the leaf of a depth-limited open-hand alpha-beta search has no measured precedent in any trick-taking game the researchers found. The nearest evidence:

- Bridge double-dummy networks get the exact trick count right on **53.11% of suit contracts**, and are off by more than one trick on 3.52% ([Mossakowski & Mańdziuk 2009](https://pages.mini.pw.edu.pl/~mandziukj/PRACE/IEEETNN09.pdf)).
- Chess's NNUE "approximately halved search speed" yet made Stockfish stronger ([Chessprogramming wiki: NNUE](https://www.chessprogramming.org/NNUE)).
- Expert Iteration trains a fast network on search outputs and then searches with it ([Anthony, Tian & Barber 2017](https://arxiv.org/abs/1705.08439)).

Here, the leaf must cover positions with 7–11 tricks left. Positions with 7 left can be labelled exactly at solver speed. Positions with 8–10 left can probably be labelled exactly offline. Positions with 11 left need bootstrapping from the shallower networks.

**Local timings** (scalar TypeScript, random weights; local measurement):

| Evaluator | Time per call | Solver-node equivalents (at about 90 ns per node) |
|---|---|---|
| Table evaluator | 41–48 ns | about 0.5 |
| 16–32-wide network updated incrementally | 0.26–0.78 µs | 3–8 |
| 64-wide network | 2.3–2.8 µs | 25–30 |

Integer quantization, the source of NNUE's speed, needs int8/int16 SIMD instructions, which pure TypeScript cannot use ([nnue-pytorch docs](https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md)).

**The decisive fact is local.** The roadmap reports that searching one trick deeper, which shrinks the leaf's error, "gained nothing measurable" ([roadmap](bot-roadmap.md)). Leaf accuracy is therefore not what limits card play today. The greedy playout's real damage is in contract decisions, and the CVM replaces it there more directly. The distillation pipeline is better spent on the CVM first.

| Technique | Evidence (game; gain; compute) | Constraint fit | Build / runtime here | Verdict |
|---|---|---|---|---|
| DouZero or PerfectDou as the whole agent | DouDizhu: win probability 0.586 vs DeltaDou after about 10 days on 48 threads + 4 GPUs; PerfectDou used 880 cores + 8 GPUs | Train fails; TS is fine at the root (about 1 ms per call) | Months | **Skip** |
| Perfect-information auxiliary targets (PerfectDou critic, Suphx oracle guiding) | DouDizhu: +0.04 win probability at equal samples | All | Free inside CVM training | **Adopt**, inside the CVM |
| Suphx run-time policy adaptation | Mahjong: 66% vs unadapted; too slow for Tenhou | Time and Stateless fail | n/a | **Skip** |
| ReBeL / Student of Games | Poker, Scotland Yard; data-centre training | Train and TS fail; belief inputs about 10^7× poker's | n/a | **Skip** |
| Learned card-play policy replacing PIMC | Skat: imitation slightly weaker; transformer −16.31 (−9.84 with search); Hearts is the exception | All | n/a | **Skip**, as the player |
| Solver-distilled leaf evaluator for 7–11 tricks left (tables or a 16–32-wide incremental MLP) | No trick-taking precedent; NNUE stronger at half the speed; double-dummy nets 53% exact | All | 2–3 weeks; 0.05–0.8 µs per leaf | **Later** |
| Integer quantization (NNUE style) in TS | Needs int8/int16 SIMD | TS: no speed gain | n/a | **Skip** |

## PIMC's all-seeing partner is a robustness risk that no trick-taking study has measured

### PIMC bots treat partner as a double-dummy player

In GIB-style PIMC, partner plays the double-dummy best card in every sampled world. That partner sees cards it could not see at a real table. GIB therefore "never suggests making an 'information gathering play'". Ginsberg justifies treating defenders as all-seeing on three grounds: they hold fewer high cards, they signal, and after the first few tricks their play is "closer to double dummy than is the declarer's" ([Ginsberg 2001](https://arxiv.org/abs/1106.0669)). Open-source BEN "can't use or interpret defensive signals" ([BEN README](https://github.com/lorserker/ben)). Inside a PIMC world, informing partner is worth exactly nothing, so the bot never makes an information-giving play. Make-a-Million has no established carding conventions, so Ginsberg's justification is weaker here: human partners will be further from double-dummy play than bridge defenders are.

### The wrong partner model is expensive wherever it has been measured

**Bridge bidding.** Lockhart et al.'s table is the cleanest bridge measurement. Their partnership-trained agent with search scored **+0.85 IMPs/deal partnered with itself, but only +0.12 partnered with WBridge5**. An agent trained to complement an imitation model of WBridge5 scored +0.48 with WBridge5 as partner ([Lockhart et al. 2020](https://arxiv.org/abs/2011.14124)). Its human test, 32 deals with one expert who was an author, gave +0.97 ± 0.76 IMPs/deal, too few to settle anything.

**Hanabi.** Conventions learned in self-play collapse with unfamiliar partners:

- The SAD agent scored **23.97 in self-play and 2.52 with independently trained copies** ([Hu et al. 2020](https://ar5iv.labs.arxiv.org/html/2003.02979)). With a behaviour-cloned human proxy it scored **0.83** ([Hu et al. 2021b](https://arxiv.org/abs/2103.04000)).
- Other-Play, which forbids conventions that rely on arbitrary symmetric choices, raised human partners' scores from 9.15 to 15.75 ([Hu et al. 2020](https://ar5iv.labs.arxiv.org/html/2003.02979)).
- Off-Belief Learning, which grounds its beliefs on a uniform-random model of past play, reached 16.76 with the same human proxy ([Hu et al. 2021b](https://arxiv.org/abs/2103.04000)).
- Equal scores can still hide worse partnership. In a blind 29-person study, humans scored the same with a learned partner and a rule-based one (p = 0.709) but trusted the rule-based one more ([Siu et al. 2021](https://arxiv.org/abs/2107.07630)).
- Search regularised toward a human-like policy (piKL) gave expert Hanabi players **22.23 against 21.21** for an unregularised best response (p = 0.097), and 31.86% against 22.52% perfect games (p = 0.058) ([Hu et al. 2022](https://arxiv.org/abs/2210.05125); [Jacob et al. 2022](https://proceedings.mlr.press/v162/jacob22a.html)).

### Trick-taking evidence on partners is sparse but consistent

- **Spades (AI Factory).** In the commercial product, most beta-tester complaints were about the AI *partner*. The worst was failing to cover the human's nil bid. The cause was the opposite partner model: random rollouts "tend to fail nil bids", so the AI gave up on its partner's contract. Biased determinizations made it worse: one card was assigned to a hand in 87% of sampled deals while its inferred probability was 1/3. Heuristic knowledge in the search "has no statistically significant impact" on win rate, but "a significant positive impact on the player's subjective impressions" ([Whitehouse et al. 2013](https://ojs.aaai.org/index.php/AIIDE/article/view/12679)).
- **Doppelkopf.** The UCT player's rollouts assume "the other players act similar to the UCT player itself" ([Sievers & Helmert 2015](https://ai.dmi.unibas.ch/papers/sievers-helmert-ki2015.pdf)).
- **Skat.** The PI gains above came mostly from the cooperating defenders. Paranoia search on defence "requires one defender to assume that his partner will intentionally play poorly" ([Edelkamp 2021](https://arxiv.org/abs/2104.05423)).

### For Make-a-Million: a mixture of partner types, recomputed every decision

PIMC's all-seeing partner causes four errors:

1. **Over-trust:** ducking because partner "will" win with the Tiger.
2. **Partner strategy fusion:** in effect partner plays differently in worlds it cannot tell apart, which inflates the value of cooperative lines.
3. **No value for informing partner.**
4. **Asymmetric error:** all-seeing opponents make PIMC pessimistic, which is relatively safe, but an all-seeing partner makes it optimistic.

**The fix that fits the constraints is a mixture of partner types in the world weights.**

- **Types:** a Hard-like partner, a Normal-like partner and a uniform-random partner. Each types' likelihood of partner's observed moves enters the world weight.
- **Prior:** it can depend on whether partner is a bot. The observation's table setup states which seats are bots ([bot standards](bot-standards.md)). Humans also see each bot's difficulty label, so information parity arguably permits that too. That is a project decision.
- **Posterior:** recomputed from the observation at every decision, which keeps the bot stateless.
- **The uniform type** costs nothing to compute. It is Off-Belief Learning's grounding idea, and it stops the policy model from reading meaning into an Easy partner's random cards.

**Three further steps build on the mixture:**

- **Partner policy inside the solver.** Partner's nodes in each world follow Normal's policy, run from partner's reconstructed observation, and the result is blended with the double-dummy value by the type posterior. A deterministic policy collapses partner's branching factor to one, so this costs no more than the current solve. No published test exists.
- **piKL-style anchoring.** Choose the argmax of π_anchor(a)·exp(Q(a)/λ), with a softened Normal heuristic as the anchor. It costs nothing beyond PIMC's existing Q-values and stays deterministic.
- **No invented conventions.** Read only "natural" inferences, such as partner passing up a chance to win with the Tiger.

**Evaluate with a matrix, not one number.** Use Stone et al.'s swap-one-teammate procedure ([Stone et al. 2010](https://www.cs.utexas.edu/users/pstone/Papers/bib2html-links/AAAI10-adhoc.pdf)) as a duplicate partner × opponents matrix:

- partners Hard, Normal and Easy;
- held-out variants the bot does not model, such as Normal with ε-random moves, following Lockhart's and Carroll's warnings about overfitting to an exact partner model ([Carroll et al. 2019](https://arxiv.org/abs/1910.05789));
- contract and make rates for each partner type;
- a legibility proxy: how often Hard overtakes partner's winner or wastes a special.

Start logging human games now. They are the only route to a human-proxy partner of the kind Hanabi research moved to ([Dizdarević et al. 2025](https://arxiv.org/abs/2506.21490)).

| Technique | Evidence (game; gain; compute) | Constraint fit | Build / runtime here | Verdict |
|---|---|---|---|---|
| Mixture of partner types (Hard-like, Normal-like, uniform) in world weighting | Skat: PI gains mostly on defence; Hanabi grounding with a human proxy 0.83 → 16.76 | All; seat labels are in the observation | +2–3 days on top of PI; up to 3× policy evaluations for partner's moves | **Adopt** |
| No invented signalling conventions | Hanabi: 23.97 → 2.52 in cross-play; bridge: +0.85 with itself vs +0.12 with a foreign partner | n/a | n/a | **Adopt** |
| Partner × opponent robustness matrix with held-out partner variants | Stone 2010 procedure; Lockhart's two-column reporting; Hanabi human proxies | Offline | 2–3 days of harness work | **Adopt** |
| Partner policy inside the solver, blended with double-dummy by the type posterior | No published test | All; cheaper per world | About 1 week | **Try** |
| piKL-style anchoring to a softened Normal policy | Hanabi experts 21.21 → 22.23 (p = 0.097); Spades: same strength, better perception | All (the argmax keeps it deterministic) | 1–2 days; negligible | **Try** |
| GIB's recursive defence from partner's view | Bridge: −0.05 IMPs/deal | Time | n/a | **Skip** (the RecPIMC trial covers it) |
| Assuming a paranoid or adversarial partner by default | Spades: paranoid even with max^n (abstract only); Skat needs "partner plays poorly" | All | n/a | **Skip** |
| Other-Play, Off-Belief Learning or Fictitious Co-Play training | Large Hanabi and Overcooked gains | Train | n/a | **Skip** (borrow the ideas) |
| Human-data imitation or a human-proxy partner | Bridge Base Online's BEN trained on 100M human hands | Blocked: no human logs yet | n/a | **Later**; start logging now |

## A ranked plan that fits one thread and 24 cores

The ranking orders techniques by expected equity per week of work. Cheap diagnostics gate the expensive search projects. Every item is a pure function of the observation and a seed, with fixed pool, sample and node counts. Learned-model evaluations count against the budget at about 25–40 solver-node equivalents each for a 32-wide network (my arithmetic from the local timings).

**Measuring small gains takes many boards.** The roadmap's two 1,500-board runs gave a 95% interval of about ±0.65% equity per board ([roadmap](bot-roadmap.md)). Bridge work needed about 10,000 duplicate deals, with statistics on the subset whose outcomes differ, to resolve 1-percentage-point effects ([Cazenave, Legras & Ventos 2021](https://arxiv.org/abs/2101.12639)).

**Fit to each of the seven constraints, for the techniques worth building:**

| Technique | Det | Stateless | Obs | Time | Budget | TS | Train |
|---|---|---|---|---|---|---|---|
| CVM + ceiling + opponent ceilings + paired deals | Yes (seeded shared deal set) | Yes | Yes (hand, widow, auction) | Yes (µs per call) | Yes (fixed deal count) | Yes (tables or 2–3-layer MLP) | Yes (10^5 hands/day plus playout distillation) |
| Widow expectimax, support-gated | Yes | Yes | Yes | Yes (about 50 ms) | Yes (fixed widow count) | Yes | Shares the CVM |
| PI with BEN plumbing and partner types | Yes (floors step deterministically) | Yes (recomputed per decision) | Yes (history, seat labels) | Yes (30–300 ms) | Yes (fixed pool; evaluations counted as node equivalents) | Yes (small MLP) | Yes (about 5.7M plays/day) |
| Card-location proposal | Yes | Yes | Yes | Yes (one pass) | Yes | Yes | Yes |
| Rule-based card reading | Yes | Yes | Yes | Yes | Yes | n/a | n/a |
| Smoothed match equity | Yes | Yes | Yes (scores) | Yes (lookup) | Yes | Yes | Minutes |
| Exact endgame diagnostic + lc/b/df | n/a (offline) | n/a | n/a | Offline | n/a | n/a | Yes |
| αμ M = 2 + sure-make check | Yes (transposition table per decision) | Yes | Yes | Tight (at least 3.5× per world; about 5× headroom) | Needs a node-count stop | n/a | n/a |
| Late-hand RecPIMC | Yes (inner seeds derived from outer seed) | Yes | Yes (projected observations of each world) | Only with ≤4–6 tricks left | Yes | n/a | n/a |
| Partner policy inside the solver | Yes | Yes | Yes | Yes (cheaper per world) | Yes | n/a (Normal is code) | n/a |
| piKL anchoring | Yes (argmax) | Yes | Yes | Yes | Yes | n/a (the anchor is code) | n/a |

**Ranked list:**

| Rank | What to try | Verdict | Why it fits this game | Build | Runtime | Promote when |
|---|---|---|---|---|---|---|
| 1 | Contract-value distribution model, distilled from playouts, then fitted to Hard outcomes, with par values as auxiliary input | **Adopt** | Bidding is the weakest component (bid ≈ pass within 0.01; r = −0.015); calibration alone was worth +5.7% equity; learned evaluators carried Skat bidding (+1.17 TP/G) | About 2 weeks | µs per call | Held-out log loss beats the calibrated playout; then duplicate A/B |
| 2 | Ceiling bidding, opponent ceilings from the bot's own ceiling function, paired evaluation on shared seeded deals | **Adopt** | Replaces the mismatched heuristic auction model and the unpaired bid-vs-pass comparison (GIB, Lockhart, BEN) | About 1.5 weeks | Hundreds of deals × µs | Duplicate A/B against Hard and against a passive bidder; report contract and make rates |
| 3 | Policy-based inference over all card play: small factored network, tempered, BEN plumbing, partner-type mixture | **Adopt** | Largest published card-play gain; the specials version already won +4.1k/hand of a 21k specials gap, and the whole oracle gap is 129k | 1.5–2.5 weeks | 30–300 ms | Effective sample size never collapses; the gain holds with Normal and Easy partners |
| 4 | Widow expectimax with a support-gated max for discard and trump | **Adopt** | Kermit's structure; Rebstock's winner's-curse warning; today's re-check needs a node cap to fit Expert's time | 3–5 days after rank 1 | About 50 ms | Duplicate A/B; discard p99 within budget |
| 5 | Robustness matrix: partner × opponents, held-out partner variants, bidding exposure, legibility proxy | **Adopt** | Every model fitted to self-play risks private conventions (Lockhart, Hanabi); roadmap item 5 | 2–3 days | Simulation only | Gates ranks 3, 10 and 11 |
| 6 | Exact endgame diagnostic plus lc/b/df measurement | **Adopt** (can run in parallel at any time) | Splits the +25k last-four-tricks oracle gap into information and PIMC's flaws | 3–5 days | Offline | Decides ranks 9 and 10 |
| 7 | Rule-based card reading; smoothed match-equity model | **Try** | Spades +15.4%; Skat +1.19 pp; match-equity table noise 1.6% per cell | Days each | Negligible | Duplicate A/B |
| 8 | Card-location network as PI's proposal | **Try** | Skat +4.7 TP/G over tables; weights need a plausible pool (ScrofaZero) | About 1 week | One pass | Effective sample size rises; duplicate A/B |
| 9 | αμ M = 2 in the exact window, with the sure-make/set check | **Try**, if rank 6 finds several k/hand of fusion | Bridge: about 1% of deals improve at 3.5× time | 1.5–3 weeks | At least 3.5× PIMC | Rate of moves that differ from PIMC, then win rate on the differing duplicate deals |
| 10 | Late-hand RecPIMC, or partner policy inside the solver | **Try**, if rank 5 shows partner over-trust | The only methods that stop partner seeing hidden cards | 3–5 days / about 1 week | Compute-bound, late in the hand only | Normal and Easy partner columns at equal compute |
| 11 | piKL anchoring when partner is human | **Try** | Hanabi experts 21.21 → 22.23; Spades perception results | 1–2 days | Negligible | Easy and Normal partner columns; legibility proxy |
| 12 | Solver-distilled leaf evaluator, learned belief generator, presumed-value PIMC, jump bids, RL bid networks, human-data models | **Later** | No trick-taking precedent, or blocked by data; local evidence says leaf depth is not the limit | Weeks | Varies | n/a |

**Skipped and why:**

- Extended PIMC, ISMCTS, GO-MCTS, vector minimaxing and lattice search: no gain in card play, or too slow for the budget.
- ReBeL, Student of Games, SPARTA's exact beliefs and test-time belief fine-tuning: belief-space size, compute, or two-player zero-sum theory.
- DouZero- or PerfectDou-style whole agents, and end-to-end reinforcement learning of the auction: they lose to PIMC in Skat-like games and need cluster-scale training.
- GIB's recursive defence and a paranoid default partner: measured losses or excessive pessimism.

## Conclusion

The literature changes the question. "Which algorithm beats PIMC?" has almost no positive answer in trick-taking games with contracts. PIMC is already a strong card player; what it lacks is good inputs. Every reliable gain in Skat and bridge came from giving it better worlds or valuing its contracts with a learned model. Make-a-Million's saturation result, where three times the nodes bought nothing, confirms this locally. The roughly fivefold time headroom under the deadline should therefore go to larger, better-weighted world pools and microsecond-scale learned evaluators, not deeper trees. The expected payoff is uneven. Bidding has the clearest headroom, because its current estimate cannot tell hands apart. Card-play inference has the largest prize but the most published caveats about how much of it a double-dummy decision can use.

The new risk is self-reference. Every recommended model learns the bots' own habits: the CVM fitted on Hard's outcomes, PI fitted on Hard's plays, and opponent ceilings from the bot's own ceiling function. That is the setup in which Kermit's inference added nothing against XSkat, LBS lost when both players used it, and Lockhart's search exploited its imitation model. Tempering, a uniform partner type, held-out partner variants and logging human games are therefore part of the core design, not polish. Search work should wait for one number: how much of the +25k last-four-tricks oracle gap an exact information-set solve recovers. If that is only a few thousand points per hand, αμ and recursive PIMC are not worth building.

## Sources

Entries without a flag were read in full, or at the relevant passages, by the researchers whose notes this report synthesises. Flags mark what the notes could not confirm.

### Search beyond PIMC
- Ian Frank and David Basin, "Search in games with incomplete information: a case study using Bridge card play", *Artificial Intelligence* 100(1–2):87–123, 1998. https://doi.org/10.1016/S0004-3702(97)00082-9 **[Unverified: full text not read; definitions taken from Long et al. 2010 and Cazenave & Ventos 2019]**
- Ian Frank, David Basin and Hitoshi Matsubara, "Finding Optimal Strategies for Imperfect Information Games", AAAI-98, pp. 500–507. https://mlanthology.org/aaai/1998/frank1998aaai-finding **[Partly verified: abstract only; PDF is a scanned image]**
- Jeffrey Long, Nathan R. Sturtevant, Michael Buro and Timothy Furtak, "Understanding the Success of Perfect Information Monte Carlo Sampling in Game Tree Search", AAAI-10, pp. 134–140. https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf
- Matthew L. Ginsberg, "GIB: Imperfect Information in a Computationally Challenging Game", *JAIR* 14 (2001) 303–358. https://arxiv.org/abs/1106.0669
- Tristan Cazenave and Véronique Ventos, "The αμ Search Algorithm for the Game of Bridge", arXiv:1911.07960 (2019); Monte Carlo Search, CCIS, Springer 2021, pp. 1–16. https://arxiv.org/abs/1911.07960
- Tristan Cazenave, Swann Legras and Véronique Ventos, "Optimizing αμ", IEEE CoG 2021, pp. 1–8. https://arxiv.org/abs/2101.12639
- Junkang Li, Bruno Zanuttini, Tristan Cazenave and Véronique Ventos, "Generalisation of Alpha-Beta Search for AND-OR Graphs With Partially Ordered Values", IJCAI-22, pp. 4769–4775. https://www.ijcai.org/proceedings/2022/661 **[Scope verified; results not extracted]**
- Junkang Li, Bruno Zanuttini and Véronique Ventos, "Opponent-Model Search in Games with Incomplete Information", AAAI-24, 38(9):9840–9847. https://ojs.aaai.org/index.php/AAAI/article/view/28844 **[Partly verified: abstract only]**
- Samuel Bounan and Stefan Edelkamp, "Trick Costs for αμ and New Relatives", LNCS (ISAIM 2024), Springer 2024, pp. 50–67. https://api.crossref.org/works/10.1007/978-3-031-63735-3_3 **[Unverified: content known from a search snippet only]**
- Jérôme Arjonilla, Abdallah Saffidine and Tristan Cazenave, "Perfect Information Monte Carlo with Postponing Reasoning", IEEE CoG 2024. https://arxiv.org/abs/2408.02380
- Jérôme Arjonilla, Abdallah Saffidine and Tristan Cazenave, "Mixture of Public and Private Distributions in Imperfect Information Games", IEEE CoG 2023. https://arxiv.org/abs/2405.14346 **[Partly verified: abstract; numerical results not extracted]**
- Timothy Furtak and Michael Buro, "Recursive Monte Carlo search for imperfect information games", IEEE CIG 2013, pp. 1–8. https://api.openalex.org/works/doi:10.1109/CIG.2013.6633646 **[Partly verified: abstract only; no numbers obtained]**
- Bruno Bouzy, Alexis Rimbaud and Véronique Ventos, "Recursive Monte Carlo Search for Bridge Card Play", IEEE CoG 2020, pp. 229–236. https://dblp.uni-trier.de/rec/conf/cig/BouzyRV20.html **[Unverified: abstract snippets only]**
- Peter I. Cowling, Edward J. Powley and Daniel Whitehouse, "Information Set Monte Carlo Tree Search", *IEEE TCIAIG* 4(2):120–143, 2012. https://eprints.whiterose.ac.uk/75048/1/CowlingPowleyWhitehouse2012.pdf
- Florian Wisser, "An Expert-Level Card Playing Agent Based on a Variant of Perfect Information Monte Carlo Sampling", IJCAI 2015. https://ijcai.org/proceedings/2015/25 **[Partly verified: abstract; detailed numbers via a summarising extraction]**
- Stefan Edelkamp, "Knowledge-Based Paranoia Search in Trick-Taking", arXiv:2104.05423 (2021; IEEE CoG 2021 per later citations). https://arxiv.org/abs/2104.05423 **[Partly verified: abstract]**
- Stefan Edelkamp, "Representing and Reducing Uncertainty for Enumerating the Belief Space to Improve Endgame Play in Skat", ECAI 2020. https://ebooks.iospress.nl/pdf/doi/10.3233/FAIA200118 **[Partly verified: abstract only]**
- Douglas Rebstock, Christopher Solinas, Nathan R. Sturtevant and Michael Buro, "Transformer Based Planning in the Observation Space with Applications to Trick Taking Card Games", arXiv:2404.13150 (2024). https://arxiv.org/abs/2404.13150
- Martin Schmid et al., "Student of Games: A unified learning algorithm for both perfect and imperfect information games", *Science Advances* 9(24), eadg3256, 2023. https://arxiv.org/abs/2112.03178

### Inference and deal sampling
- Douglas Rebstock, Christopher Solinas, Michael Buro and Nathan R. Sturtevant, "Policy Based Inference in Trick-Taking Card Games", IEEE CoG 2019. https://arxiv.org/abs/1905.10911 **[Proceedings page numbers unverified]**
- Christopher Solinas, Douglas Rebstock and Michael Buro, "Improving Search with Supervised Learning in Trick-Based Card Games", AAAI 2019. https://arxiv.org/abs/1903.09604
- Michael Buro, Jeffrey R. Long, Timothy Furtak and Nathan Sturtevant, "Improving State Evaluation, Inference, and Search in Trick-Based Card Games", IJCAI-09, pp. 1407–1412. https://cs.du.edu/~sturtevant/papers/skat.pdf
- BEN (Bridge Engine), lorserker/ben, GitHub: README, `src/config/default.conf`, `src/sample.py`, release notes 0.9.0.0 and 0.9.0.1 (read 2026-11-22). https://github.com/lorserker/ben ; https://github.com/lorserker/ben/blob/main/src/config/default.conf ; https://github.com/lorserker/ben/blob/main/src/sample.py ; https://github.com/lorserker/ben/blob/main/install/release-notes-0.9.0.0.md ; https://github.com/lorserker/ben/blob/main/install/release-notes-0.9.0.1.md
- Hengyuan Hu, Adam Lerer, Noam Brown and Jakob Foerster, "Learned Belief Search: Efficiently Improving Policies in Partially Observable Settings", arXiv:2106.09086 (2021). https://arxiv.org/abs/2106.09086 **[Preprint; no peer-reviewed venue found; the author list in the original brief, which included Cui and Pineda, does not match arXiv v1]**
- Adam Lerer, Hengyuan Hu, Jakob Foerster and Noam Brown, "Improving Policies via Search in Cooperative Partially Observable Games" (SPARTA), AAAI 2020, 34(5):7187–7194. https://arxiv.org/abs/1912.02318
- Samuel Sokota, Hengyuan Hu, David J. Wu, J. Zico Kolter, Jakob Foerster and Noam Brown, "A Fine-Tuning Approach to Belief State Modeling", ICLR 2022. https://research.facebook.com/file/291538229793451/A-Fine-tuning-Approach-to-Belief-State-Modeling.pdf
- Samuel Sokota, Eugene Vinitsky, Hengyuan Hu, Zhiyuan Fan, J. Zico Kolter and Gabriele Farina, "Scalable Decision Making for Games of Imperfect Information", arXiv:2511.07312 (v2, 2026). https://arxiv.org/abs/2511.07312 **[Dou dizhu training compute not extracted]**
- Naichen Shi, Ruichen Li and Sun Youran, "ScrofaZero: Mastering Trick-taking Poker Game Gongzhu by Deep Reinforcement Learning", arXiv:2102.07495 (2021). https://arxiv.org/abs/2102.07495 **[No peer-reviewed venue found; the baseline opponent in its table is not named in the extracted text]**
- Jeff Rollason, article on opponent-hand inference in AI Factory Spades, AI Factory newsletter, Winter 2018 (published January 2019). https://aifactory.co.uk/newsletter/2018_02_opponent_hand.htm
- Stefan Edelkamp, "Inner-Learning: From Hand-Coded Beliefs to Declarative Knowledge in Trick-Taking Games", arXiv:2610.38304 (2026). https://arxiv.org/abs/2610.38304

### Bidding and contract choice
- Douglas Rebstock, Christopher Solinas and Michael Buro, "Learning Policies from Human Data for Skat", IEEE CoG 2019, DOI 10.1109/CIG.2019.8848125. https://arxiv.org/abs/1905.10907 **[One note flags the venue as unverified; another gives the DOI]**
- Stefan Edelkamp, "Outer-Learning Framework for Playing Multi-Player Trick-Taking Card Games: A Case Study in Skat", arXiv:2512.15435 (2025). https://arxiv.org/abs/2512.15435
- Edward Lockhart, Neil Burch, Nolan Bard, Sebastian Borgeaud, Tom Eccles, Lucas Smaira and Ray Smith, "Human-Agent Cooperation in Bridge Bidding", Cooperative AI Workshop at NeurIPS 2020, arXiv:2011.14124. https://arxiv.org/abs/2011.14124 **[Venue beyond arXiv unverified in one note; posterior-exponent formula read from garbled PDF text]**
- BEN bidder, `src/botbidder.py` (read 2026-11-22). https://github.com/lorserker/ben/blob/main/src/botbidder.py
- Kita, Koyamada, Yamaguchi et al., "A Simple, Solid, and Reproducible Baseline for Bridge Bidding AI", arXiv:2406.10306 (2024). https://arxiv.org/abs/2406.10306 **[Venue unverified, likely IEEE CoG 2024]**
- Zizhang Qiu, Shouguang Wang, Dan You and MengChu Zhou, "Bridge Bidding via Deep Reinforcement Learning and Belief Monte Carlo Search", *IEEE/CAA Journal of Automatica Sinica* 11(10):2111–2122, 2024. https://www.ieee-jas.net/article/doi/10.1109/JAS.2024.124488 **[Partly verified: abstract and figure captions only]**
- AlphaDou (2024), arXiv:2407.10279. https://arxiv.org/abs/2407.10279 **[Full title and authors not recorded in the notes]**
- Joel Niklaus, MSc thesis on Jass AI (trump selection with DNN, rules and MCTS), University of Fribourg, 2019. https://joelniklaus.github.io/files/theses/Master_Thesis.pdf
- Daniel Whitehouse, Peter I. Cowling, Edward J. Powley and Jeff Rollason, "Integrating Monte Carlo Tree Search with Knowledge-Based Methods to Create Engaging Play in a Commercial Mobile Game", AIIDE 2013. https://ojs.aaai.org/index.php/AIIDE/article/view/12679
- Gal Cohensius, Reshef Meir, Nadav Oved and Roni Stern, "Bidding in Spades", ECAI 2020. https://arxiv.org/abs/1912.11323
- Silvan Sievers and Malte Helmert, "A Doppelkopf Player Based on UCT", KI 2015, LNCS 9324, pp. 151–165. https://ai.dmi.unibas.ch/papers/sievers-helmert-ki2015.pdf

### Learning-based agents and learned evaluations
- Daochen Zha, Jingru Xie, Wenye Ma, Sheng Zhang, Xiangru Lian, Xia Hu and Ji Liu, "DouZero: Mastering DouDizhu with Self-Play Deep Reinforcement Learning", ICML 2021, PMLR 139:12333–12344. https://arxiv.org/abs/2106.06135
- Guan Yang, Minghuan Liu, Weijun Hong, Weinan Zhang, Fei Fang, Guangjun Zeng and Yue Lin, "PerfectDou: Dominating DouDizhu with Perfect Information Distillation", NeurIPS 2022. https://arxiv.org/abs/2203.16406
- Junjie Li, Sotetsu Koyamada, Qiwei Ye, Guoqing Liu, Chao Wang, Ruihan Yang, Li Zhao, Tao Qin, Tie-Yan Liu and Hsiao-Wuen Hon, "Suphx: Mastering Mahjong with Deep Reinforcement Learning", arXiv:2003.13590 (2020). https://arxiv.org/abs/2003.13590 **[No peer-reviewed venue; ablation values shown only as plots]**
- Noam Brown, Anton Bakhtin, Adam Lerer and Qucheng Gong, "Combining Deep Reinforcement Learning and Search for Imperfect-Information Games" (ReBeL), NeurIPS 2020. https://arxiv.org/abs/2007.13544
- Nathan R. Sturtevant and Adam M. White, "Feature construction for reinforcement learning in hearts", Computers and Games 2006 (LNCS 2007). https://www.springerprofessional.de/feature-construction-for-reinforcement-learning-in-hearts/2891304 **[Unverified: snippet only; PDF returned 404]**
- Jonas Schumacher and Marco Pleines, Wizard DQN agents, arXiv:2205.13834 (IEEE CoG 2022). https://arxiv.org/abs/2205.13834
- Krzysztof Mossakowski and Jacek Mańdziuk, "Learning without human expertise: A case study of the Double Dummy Bridge Problem", *IEEE Transactions on Neural Networks*, 2009. https://pages.mini.pw.edu.pl/~mandziukj/PRACE/IEEETNN09.pdf **[Venue inferred from the PDF file name in one note]**
- Thomas Anthony, Zheng Tian and David Barber, "Thinking Fast and Slow with Deep Learning and Tree Search", arXiv:1705.08439 (2017). https://arxiv.org/abs/1705.08439 **[NeurIPS 2017 venue commonly cited but not on the arXiv page]**
- Chessprogramming wiki, "NNUE". https://www.chessprogramming.org/NNUE
- Stockfish nnue-pytorch, `docs/nnue.md`. https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md

### Partnerships and human robustness
- Hengyuan Hu, Adam Lerer, Alex Peysakhovich and Jakob Foerster, "'Other-Play' for Zero-Shot Coordination", ICML 2020, PMLR 119:4399–4410. https://ar5iv.labs.arxiv.org/html/2003.02979
- Hengyuan Hu, Adam Lerer, Brandon Cui, David Wu, Luis Pineda, Noam Brown and Jakob Foerster, "Off-Belief Learning", ICML 2021, PMLR 139. https://arxiv.org/abs/2103.04000
- Siu, Peña, Chen, Zhou, Lopez, Palko, Chang and Allen, "Evaluation of Human-AI Teams for Learned and Rule-Based Agents in Hanabi", NeurIPS 2021. https://arxiv.org/abs/2107.07630
- Athul Paul Jacob, David J. Wu, Gabriele Farina, Adam Lerer, Hengyuan Hu, Anton Bakhtin, Jacob Andreas and Noam Brown, "Modeling Strong and Human-Like Gameplay with KL-Regularized Search", ICML 2022, PMLR 162:9695–9728. https://proceedings.mlr.press/v162/jacob22a.html
- Hengyuan Hu, David J. Wu, Adam Lerer, Jakob Foerster and Noam Brown, "Human-AI Coordination via Human-Regularized Search and Learning", arXiv:2210.05125 (NeurIPS 2022 Deep RL Workshop). https://arxiv.org/abs/2210.05125 **[ICLR 2023 listing unverified]**
- Micah Carroll, Rohin Shah, Mark K. Ho, Thomas L. Griffiths, Sanjit A. Seshia, Pieter Abbeel and Anca Dragan, "On the Utility of Learning about Humans for Human-AI Coordination", NeurIPS 2019. https://arxiv.org/abs/1910.05789
- Peter Stone, Gal A. Kaminka, Sarit Kraus and Jeffrey S. Rosenschein, "Ad Hoc Autonomous Agent Teams: Collaboration without Pre-Coordination", AAAI 2010, pp. 1504–1509. https://www.cs.utexas.edu/users/pstone/Papers/bib2html-links/AAAI10-adhoc.pdf
- Dizdarević, Hammond, Gessler, Calinescu, Cook, Gallici, Lupu, Muglich, Forkel and Foerster, "Ad-Hoc Human-AI Coordination Challenge", ICML 2025. https://arxiv.org/abs/2506.21490

### Project documents and local measurement
- Make-a-Million bot roadmap, `docs/bot-roadmap.md` (this repository): Hard's design and timing, oracle gaps, bidding diagnostics, specials-inference results, match-equity noise, simulation throughput. [bot-roadmap.md](bot-roadmap.md)
- Make-a-Million bot standards, `docs/bot-standards.md`: information parity, observation contents, seat labels, determinism. [bot-standards.md](bot-standards.md)
- Local micro-benchmark of table and small-MLP evaluators in scalar JavaScript (Node v24.21.0, Intel i7-14650HX, random weights, CPU scaling at 50%, noisy across runs). **[Local measurement, not a published source; the script was not kept]**
