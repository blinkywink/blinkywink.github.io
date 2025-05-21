const Footer = () => {
  return (
    <footer className="bg-gray-100 py-8">
      <div className="container">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-gray-600">
              © {new Date().getFullYear()} BLINKYWINK.CO
            </p>
          </div>
          <div className="flex space-x-6">
            <a
              href="https://youtube.com/@blinkywink"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-black"
            >
              YouTube
            </a>
            <a
              href="mailto:blinkywinkcontact@pm.me"
              className="text-gray-600 hover:text-black"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer 