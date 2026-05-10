import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Fb from "../../assets/Facebook_Logo_Primary.png";
import Ig from "../../assets/Instagram_Glyph_Gradient.png";
import Twitter from "../../assets/logo-black.png";
import MyProfile from "../../assets/profileFb.jpg";
import "./mystory.css";

const MyStory = () => {
  return (
    <div className="mystory">
      <div className="mystory__container">
        <aside className="mystory__profile" aria-label="About the founder">
          <figure>
            <motion.img
              loading="lazy"
              className="mystory__profile-image"
              src={MyProfile}
              alt="Portrait of Loren, founder of FoodieAI"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            />

            <div className="mystory__profile-content">
              <figcaption className="mystory__name">
                <h2>Hi! It's Loren</h2>
                <p className="founder">(Founder)</p>
              </figcaption>

              <nav aria-label="Social media links">
                <ul className="mystory__socmedia-links">
                  <li>
                    <Link
                      to={"https://www.instagram.com/johnmathewloren/"}
                      aria-label="Instagram"
                    >
                      <motion.img
                        loading="lazy"
                        whileHover={{ scale: 1.2 }}
                        className="socmed-icons"
                        src={Ig}
                        alt="Instagram logo"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={"https://www.facebook.com/johnmathew.loren/"}
                      aria-label="Facebook"
                    >
                      <motion.img
                        loading="lazy"
                        whileHover={{ scale: 1.2 }}
                        className="socmed-icons"
                        src={Fb}
                        alt="Facebook logo"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    </Link>
                  </li>
                  <li>
                    <Link
                      to={"https://x.com/LorenJohnmathew"}
                      aria-label="Twitter"
                    >
                      <motion.img
                        loading="lazy"
                        whileHover={{ scale: 1.2 }}
                        className="socmed-icons"
                        src={Twitter}
                        alt="Twitter logo"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </figure>
        </aside>

        <motion.article
          className="mystory__article"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <blockquote>
            <p className="mystory__quote">
              It all started when I went grocery shopping one day. I was
              standing in the bread aisle, wondering:
              <em> "Can this bread cause diabetes?"</em>
            </p>
          </blockquote>

          <div className="mystory__description">
            <section>
              <p>
                I was curious to the point that I grabbed my phone and asked
                <strong> ChatGPT</strong> to analyze the bread for me.
              </p>
              <p>
                The results were helpful, but it made me think: hmmh?
                <em>
                  "What if I could hack this process and build something that's
                  more accessible and easy?"
                </em>
              </p>
            </section>

            <section>
              <p>
                Using my programming skills, I decided to build an AI assistant
                where I could simply upload or capture any food, and immediately
                get well-structured, easy-to-read information.
              </p>
              <p>
                And that's how FoodieAi was born! - An app that can turn a
                simple food image into instant food knowledge.
              </p>
            </section>

            <section>
              <p>
                <strong>
                  Today, it's not just for me. It's for everyone who wants to
                  make smarter, healthier food choices using cutting-edge
                  technology!
                </strong>
              </p>
            </section>
          </div>
        </motion.article>
      </div>
    </div>
  );
};

export default MyStory;
